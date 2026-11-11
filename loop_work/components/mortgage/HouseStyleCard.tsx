"use client";

// The drawing of the person's home, with a few choices to make it look like
// theirs: the kind of house, floors, which side the neighbour is, the garage
// and the front door.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHouseStyle } from "@/app/mortgage/actions";
import { BRICK_COLOURS, DOOR_COLOURS, HouseIllustration, RENDER_COLOURS, ROOF_COLOURS, defaultHouseStyle, type HouseStyle } from "@/components/mortgage/HouseIllustration";

function Choice<T extends string | number>({ label, value, options, onPick }: { label: string; value: T | undefined; options: Array<[T, string]>; onPick: (value: T) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map(([option, text]) => (
          <button key={String(option)} type="button" onClick={() => onPick(option)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${value === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, value, options, onPick }: { label: string; value: string; options: Array<[string, string]>; onPick: (value: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(([colour, name]) => (
          <button key={colour} type="button" title={name} aria-label={`${label}: ${name}`} onClick={() => onPick(colour)}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ${value === colour ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: colour }} />
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HouseStyleCard({ homeId, saved, propertyType }: { homeId: string | null; saved: HouseStyle | null; propertyType: string | null }) {
  const router = useRouter();
  const initial = saved ?? defaultHouseStyle(propertyType);
  const [style, setStyle] = useState<HouseStyle>(initial);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<HouseStyle>) => setStyle((current) => ({ ...current, ...patch }));
  const isHouse = style.type !== "flat";
  const canHaveGarage = style.type === "detached" || style.type === "semi" || style.type === "bungalow";

  return (
    <div className="relative">
      <HouseIllustration style={style} className="block h-auto w-full" />
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-white">
          {saved ? "Change the drawing" : "Make it look like your home"}
        </button>
      ) : (
        <div className="space-y-3 border-t border-slate-100 bg-white p-4">
          <Choice label="Type" value={style.type} onPick={(type) => set({ type, storeys: type === "bungalow" ? 1 : type === "flat" ? 4 : style.storeys && style.storeys > 1 && style.storeys <= 3 ? style.storeys : 2 })}
            options={[["flat", "Flat"], ["terraced", "Terraced"], ["end_terrace", "End terrace"], ["semi", "Semi-detached"], ["detached", "Detached"], ["bungalow", "Bungalow"]]} />
          {style.type === "flat" ? (
            <Choice label="Floors in the building" value={style.storeys} onPick={(storeys) => set({ storeys: storeys as any })} options={[[3, "3"], [4, "4"], [5, "5"]] as any} />
          ) : style.type !== "bungalow" ? (
            <Choice label="Floors" value={style.storeys} onPick={(storeys) => set({ storeys })} options={[[2, "2"], [2.5, "2½ (loft room)"], [3, "3"]]} />
          ) : null}
          {style.type === "semi" || style.type === "end_terrace" ? (
            <Choice label="Neighbour joined on the" value={style.attachedSide} onPick={(attachedSide) => set({ attachedSide })} options={[["left", "Left"], ["right", "Right"]]} />
          ) : null}
          {isHouse ? (
            <Choice label="Garage" value={style.garage ?? "none"} onPick={(garage) => set({ garage })}
              options={canHaveGarage ? [["none", "None"], ["integral", "Built in"], ["single", "Single"], ["double", "Double"]] : [["none", "None"], ["integral", "Built in"]]} />
          ) : null}
          {isHouse && style.garage && style.garage !== "none" && style.type !== "semi" ? (
            <Choice label="Garage on the" value={style.garageSide} onPick={(garageSide) => set({ garageSide })} options={[["left", "Left"], ["right", "Right"]]} />
          ) : null}
          <Swatches label="Brick" value={style.brick ?? BRICK_COLOURS[0][0]} options={BRICK_COLOURS} onPick={(brick) => set({ brick })} />
          <Choice label="Render" value={style.render ?? "none"} onPick={(render) => set({ render })} options={[["none", "None"], ["upper", "Top half"], ["full", "Whole house"]]} />
          {style.render && style.render !== "none" ? (
            <Swatches label="Render colour" value={style.renderColour ?? RENDER_COLOURS[0][0]} options={RENDER_COLOURS} onPick={(renderColour) => set({ renderColour })} />
          ) : null}
          <Swatches label="Roof" value={style.roof ?? ROOF_COLOURS[0][0]} options={ROOF_COLOURS} onPick={(roof) => set({ roof })} />
          <Choice label="Driveway" value={style.driveway ?? "none"} onPick={(driveway) => set({ driveway })}
            options={style.garage && style.garage !== "none" ? [["none", "None"], ["garage", "In front of the garage"], ["house", "Beside the path"], ["full", "Whole front"]] : [["none", "None"], ["house", "Beside the path"], ["full", "Whole front"]]} />
          {style.driveway && style.driveway !== "none" ? (
            <Choice label="Cars on the drive" value={Number(style.cars || 0) as 0 | 1 | 2} onPick={(cars) => set({ cars })} options={[[0, "None"], [1, "One"], [2, "Two"]]} />
          ) : null}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={style.grass !== false} onChange={(e) => set({ grass: e.target.checked })} /> Lawn at the front</label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={style.shrubs !== false} onChange={(e) => set({ shrubs: e.target.checked })} /> Shrubs</label>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Front door</p>
            <div className="mt-1 flex gap-2">
              {DOOR_COLOURS.map((colour) => (
                <button key={colour} type="button" aria-label={`Door colour ${colour}`} onClick={() => set({ door: colour })}
                  className={`h-7 w-7 rounded-full ring-2 ${style.door === colour || (!style.door && colour === DOOR_COLOURS[0]) ? "ring-slate-900" : "ring-slate-200"}`} style={{ background: colour }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !homeId}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    const fd = new FormData();
                    fd.set("home_id", homeId || "");
                    fd.set("style", JSON.stringify(style));
                    await saveHouseStyle(fd);
                    setEditing(false);
                    router.refresh();
                  } catch (caught: any) {
                    setError(caught?.message || "That didn't save.");
                  }
                })
              }
              className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setStyle(initial); setEditing(false); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            {error ? <span className="text-xs text-rose-600">{error}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
