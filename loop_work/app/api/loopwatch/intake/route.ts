import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import { buildLoopWatchEvents, extractLoopWatchFacts } from "@/lib/loopwatch/extract";
import { routeLoopWatchIntake } from "@/lib/loopwatch/intake-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function averageConfidence(confidence: Record<string, unknown> | null | undefined) {
  const values = Object.values(confidence || {}).map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = await request.json();
    const query = nullableString(body.query);
    const context = nullableString(body.context);
    const ownerPersonId = nullableString(body.owner_person_id);
    const documentTypeHint = nullableString(body.document_type_hint);

    if (!query && !context) {
      return NextResponse.json({ error: "Add a search phrase or context before sending to LoopWatch." }, { status: 400 });
    }
    if (!context || context.length < 8) {
      return NextResponse.json({ error: "Give me context first, then send. Add what this is, who it relates to, and any rough cost/date." }, { status: 400 });
    }

    const householdContext = await getActiveHouseholdContext(supabase, user);
    const householdId = householdContext.householdId || null;
    const visibilityScope = householdId ? "household" : "private";
    const readableText = [query, context].filter(Boolean).join("\n");

    const { data: job, error: jobError } = await supabase
      .from("loopwatch_document_jobs")
      .insert({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        uploaded_by_user_id: user.id,
        owner_person_id: ownerPersonId,
        original_filename: query || "LoopWatch intake",
        mime_type: "text/plain",
        file_size_bytes: readableText.length,
        document_type_hint: documentTypeHint,
        user_note: context,
        status: "context_intake",
        storage_mode: "metadata_only",
        processing_started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

    const extraction = await extractLoopWatchFacts({
      text: readableText,
      filename: query || "LoopWatch intake",
      mimeType: "text/plain",
      documentTypeHint,
      userNote: context,
    });

    const { data: peopleRows } = householdId
      ? await supabase
          .from("people")
          .select("id,name,relationship,account_status")
          .eq("household_id", householdId)
          .or("account_status.is.null,account_status.neq.duplicate_merged")
      : await supabase
          .from("people")
          .select("id,name,relationship,account_status")
          .eq("user_id", user.id)
          .or("account_status.is.null,account_status.neq.duplicate_merged");

    const routing = routeLoopWatchIntake({
      extraction,
      text: readableText,
      filename: query || "LoopWatch intake",
      userNote: context,
      selectedOwnerPersonId: ownerPersonId,
      people: ((peopleRows || []) as any[]).map((person) => ({ id: person.id, name: person.name, relationship: person.relationship })),
    });
    const resolvedOwnerPersonId = ownerPersonId || (routing.suggestedOwnerConfidence >= 0.62 ? routing.suggestedOwnerPersonId : null);
    const confidenceScore = averageConfidence(extraction.confidence);

    const { data: item, error: itemError } = await supabase
      .from("loopwatch_items")
      .insert({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        owner_person_id: resolvedOwnerPersonId,
        suggested_owner_person_id: routing.suggestedOwnerPersonId,
        detected_person_name: routing.detectedPersonName,
        intake_category: routing.intakeCategory,
        routing_status: "suggested",
        routing_summary: routing.routingSummary,
        routing_suggestions_json: routing.suggestions as any,
        document_job_id: job.id,
        source_kind: "context_intake",
        attach_mode: "search_context",
        context_prompt: query,
        user_context: context,
        review_state: "needs_user_review",
        item_type: extraction.documentType,
        provider_name: extraction.providerName,
        product_name: extraction.productName,
        reference_hint: extraction.referenceHint,
        start_date: extraction.startDate,
        end_date: extraction.endDate,
        renewal_date: extraction.renewalDate,
        notice_period_days: extraction.noticePeriodDays,
        payment_amount: extraction.paymentAmount,
        payment_frequency: extraction.paymentFrequency,
        annual_cost: extraction.annualCost,
        auto_renews: extraction.autoRenews,
        cover_level: extraction.coverLevel,
        excess_total: extraction.excessTotal,
        mileage_limit: extraction.mileageLimit,
        interest_rate_percent: extraction.interestRatePercent,
        apr_percent: extraction.aprPercent,
        cancellation_summary: extraction.cancellationSummary,
        increase_summary: extraction.increaseSummary,
        summary: extraction.summary,
        terms_json: {
          ...extraction.keyTerms,
          intake_query: query,
          user_context: context,
          loopwatch_routing: routing,
          extraction_source: extraction.source,
        },
        risk_flags_json: extraction.riskFlags,
        confidence_json: extraction.confidence,
        confidence_score: confidenceScore,
        status: "needs_review",
      })
      .select("*")
      .single();
    if (itemError) throw itemError;

    const events = buildLoopWatchEvents(item.id, extraction, user.id, householdId);
    if (events.length > 0) await supabase.from("loopwatch_events").insert(events);

    const opportunityRows = routing.suggestions
      .filter((suggestion) => suggestion.type !== "confirm_details")
      .map((suggestion) => ({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        loopwatch_item_id: item.id,
        opportunity_type: suggestion.type,
        status: "open",
        priority: Math.round((suggestion.confidence || 0.5) * 100),
        title: suggestion.title,
        summary: suggestion.question || suggestion.summary,
        due_date: extraction.renewalDate || extraction.endDate || null,
        action_href: suggestion.target === "financial_flow" ? "/financial-flow" : suggestion.target === "vehicle" ? "/loopwatch#discover" : "/loopwatch",
        metadata: {
          source: "loopwatch_context_intake",
          action: suggestion.action,
          target: suggestion.target,
          payload: suggestion.payload || {},
          summary: suggestion.summary,
        },
      }));
    if (opportunityRows.length > 0) {
      await supabase.from("loopwatch_opportunities").upsert(opportunityRows as any, { onConflict: "loopwatch_item_id,opportunity_type" });
    }

    await supabase
      .from("loopwatch_document_jobs")
      .update({
        status: "metadata_only_complete",
        document_type: extraction.documentType,
        extracted_text_chars: readableText.length,
        extraction_method: "text",
        source_file_deleted_at: new Date().toISOString(),
        processing_finished_at: new Date().toISOString(),
        confidence_score: confidenceScore,
        routed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({
      ok: true,
      message: routing.routingSummary || "LoopWatch created a review card from your context.",
      item,
      routing,
      eventsCreated: events.length,
      suggestionsCreated: opportunityRows.length,
      sourceFileStored: false,
      sourceFileDeleted: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: String(error?.message || error || "LoopWatch intake failed."),
        hint: "Run the latest LoopWatch migration if this is a missing-column error.",
      },
      { status: 400 },
    );
  }
}
