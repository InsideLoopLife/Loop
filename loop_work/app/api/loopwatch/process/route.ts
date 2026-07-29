import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import { buildLoopWatchEvents, extractLoopWatchFacts, extractReadableTextFromFile } from "@/lib/loopwatch/extract";
import { routeLoopWatchIntake } from "@/lib/loopwatch/intake-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = Number(process.env.LOOPWATCH_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Upload a PDF, image or text document." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File is too large. Limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` }, { status: 400 });
  }

  const ownerPersonId = nullableString(formData.get("owner_person_id"));
  const documentTypeHint = nullableString(formData.get("document_type_hint"));
  const userNote = nullableString(formData.get("user_note"));
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdId = householdContext.householdId || null;
  const visibilityScope = householdId ? "household" : "private";

  let jobId: string | null = null;

  try {
    const { data: job, error: jobError } = await supabase
      .from("loopwatch_document_jobs")
      .insert({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        uploaded_by_user_id: user.id,
        owner_person_id: ownerPersonId,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        document_type_hint: documentTypeHint,
        user_note: userNote,
        status: "processing",
        storage_mode: "metadata_only",
        processing_started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError) throw jobError;
    jobId = job.id;

    const readable = await extractReadableTextFromFile(file);
    const extraction = await extractLoopWatchFacts({
      text: readable.text,
      filename: file.name,
      mimeType: file.type,
      documentTypeHint,
      userNote,
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
      text: readable.text,
      filename: file.name,
      userNote,
      selectedOwnerPersonId: ownerPersonId,
      people: ((peopleRows || []) as any[]).map((person) => ({ id: person.id, name: person.name, relationship: person.relationship })),
    });
    const resolvedOwnerPersonId = ownerPersonId || (routing.suggestedOwnerConfidence >= 0.62 ? routing.suggestedOwnerPersonId : null);

    const confidenceValues = Object.values(extraction.confidence || {}).map(Number).filter(Number.isFinite);
    const averageConfidence = confidenceValues.length
      ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100) / 100
      : null;

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
        document_job_id: jobId,
        source_kind: "document_upload",
        attach_mode: "file_context",
        context_prompt: file.name,
        user_context: userNote,
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
          user_note: userNote,
          loopwatch_routing: routing,
          extraction_source: extraction.source,
          extraction_warning: readable.warning,
          extraction_method: readable.extractionMethod,
        },
        risk_flags_json: extraction.riskFlags,
        confidence_json: extraction.confidence,
        confidence_score: averageConfidence,
        status: "needs_review",
      })
      .select("*")
      .single();

    if (itemError) throw itemError;

    const events = buildLoopWatchEvents(item.id, extraction, user.id, householdId);
    if (events.length > 0) {
      await supabase.from("loopwatch_events").insert(events);
    }

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
        action_href: suggestion.target === "family_planning" ? "/lifestyle/family-planning" : suggestion.target === "financial_flow" ? "/financial-flow" : "/loopwatch",
        metadata: {
          source: "loopwatch_router",
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
        status: "deleted_after_processing",
        document_type: extraction.documentType,
        extracted_text_chars: readable.text.length,
        extraction_method: readable.extractionMethod,
        extraction_warning: readable.warning,
        source_file_deleted_at: new Date().toISOString(),
        processing_finished_at: new Date().toISOString(),
        confidence_score: averageConfidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({
      ok: true,
      message: routing.routingSummary || "LoopWatch processed the document and deleted the source file. Please review the extracted card.",
      item,
      routing,
      eventsCreated: events.length,
      suggestionsCreated: opportunityRows.length,
      sourceFileStored: false,
      sourceFileDeleted: true,
      extractionWarning: readable.warning,
    });
  } catch (error: any) {
    if (jobId) {
      await supabase
        .from("loopwatch_document_jobs")
        .update({
          status: "failed_deleted_source",
          error_message: String(error?.message || error || "Unknown processing error").slice(0, 500),
          source_file_deleted_at: new Date().toISOString(),
          processing_finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
    return NextResponse.json(
      {
        error: String(error?.message || error || "Document processing failed."),
        sourceFileStored: false,
        sourceFileDeleted: true,
        hint: "Run db/v28_48_loopwatch_document_intelligence.sql first if this is a missing-table error.",
      },
      { status: 400 },
    );
  }
}
