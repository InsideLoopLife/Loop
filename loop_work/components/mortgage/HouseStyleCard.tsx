"use client";

// The drawing of the person's home, with choices to make it look like theirs:
// the kind of house, floors and loft, the front door, walls and roof, the
// garage, the drive and cars, and extras like solar panels and a charger.
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveHouseStyle } from "@/app/mortgage/actions";
import {
  BRICK_COLOURS, CAR_BODIES, CAR_COLOURS, DEFAULT_VEHICLES, DOOR_COLOURS, GARAGE_COLOURS, HouseIllustration, RENDER_COLOURS, ROOF_COLOURS,
  defaultHouseStyle, type HouseStyle, type Vehicle,
} from "@/components/mortgage/HouseIllustration";

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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-100 p-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</legend>
      {children}
    </fieldset>
  );
}

const Tick = ({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}</label>
);

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
  const outsideGarage = canHaveGarage && (style.garage === "single" || style.garage === "double");
  const hasLoft = isHouse && style.type !== "bungalow" && Number(style.storeys) % 1 !== 0;
  const cars = Number(style.cars || 0);
  const vehicle = (i: number): Vehicle => ({ ...DEFAULT_VEHICLES[i], ...(style.vehicles?.[i] || {}) });
  const setVehicle = (i: number, patch: Partial<Vehicle>) =>
    set({ vehicles: [0, 1].map((n) => (n === i ? { ...vehicle(n), ...patch } : vehicle(n))) });
  const doorDefault = style.type === "detached" || style.type === "bungalow" ? "centre" : "left";

  return (
    <div className="relative">
      <div className={editing ? "sticky top-0 z-20 border-b border-slate-200 bg-[#eef4f1] shadow-sm" : undefined}>
        <HouseIllustration style={style} className="block h-auto w-full" />
      </div>
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-white">
          {saved ? "Change the drawing" : "Make it look like your home"}
        </button>
      ) : (
        <div className="space-y-3 border-t border-slate-100 bg-white p-4">
          <Group title="Your home">
            <Choice label="Type" value={style.type} onPick={(type) => set({ type, storeys: type === "bungalow" ? 1 : type === "flat" ? 4 : style.storeys && style.storeys > 1 && style.storeys <= 3.5 ? style.storeys : 2 })}
              options={[["flat", "Flat"], ["terraced", "Terraced"], ["end_terrace", "End terrace"], ["semi", "Semi-detached"], ["detached", "Detached"], ["bungalow", "Bungalow"]]} />
            {style.type === "flat" ? (
              <Choice label="Floors in the building" value={style.storeys} onPick={(storeys) => set({ storeys })} options={[[3, "3"], [4, "4"], [5, "5"]]} />
            ) : style.type !== "bungalow" ? (
              <Choice label="Floors" value={style.storeys} onPick={(storeys) => set({ storeys })} options={[[2, "2"], [2.5, "2 + loft room"], [3, "3"], [3.5, "3 + loft room"]]} />
            ) : null}
            {hasLoft ? (
              <Choice label="Loft window" value={style.loftWindow ?? "skylight"} onPick={(loftWindow) => set({ loftWindow })}
                options={[["skylight", "Flat in the roof"], ["dormer", "Dormer, pitched"], ["flat_dormer", "Dormer, flat top"]]} />
            ) : null}
            {style.type === "semi" || style.type === "end_terrace" ? (
              <Choice label="Neighbour joined on the" value={style.attachedSide} onPick={(attachedSide) => set({ attachedSide })} options={[["left", "Left"], ["right", "Right"]]} />
            ) : null}
            {isHouse ? (
              <Choice label="Front door on the" value={style.doorSide ?? doorDefault} onPick={(doorSide) => set({ doorSide })}
                options={style.type === "detached" || style.type === "bungalow" ? [["left", "Left"], ["centre", "Middle"], ["right", "Right"]] : [["left", "Left"], ["right", "Right"]]} />
            ) : null}
          </Group>

          <Group title="Walls and roof">
            <Swatches label="Brick" value={style.brick ?? BRICK_COLOURS[0][0]} options={BRICK_COLOURS} onPick={(brick) => set({ brick })} />
            <Choice label="Render" value={style.render ?? "none"} onPick={(render) => set({ render })} options={[["none", "None"], ["upper", "Top half"], ["lower", "Bottom half"], ["full", "Whole house"]]} />
            {style.render && style.render !== "none" ? (
              <Swatches label="Render colour" value={style.renderColour ?? RENDER_COLOURS[0][0]} options={RENDER_COLOURS} onPick={(renderColour) => set({ renderColour })} />
            ) : null}
            <Swatches label="Roof" value={style.roof ?? ROOF_COLOURS[0][0]} options={ROOF_COLOURS} onPick={(roof) => set({ roof })} />
            <div>
              <p className="text-xs font-semibold text-slate-500">Front door</p>
              <div className="mt-1 flex gap-2">
                {DOOR_COLOURS.map((colour) => (
                  <button key={colour} type="button" aria-label={`Door colour ${colour}`} onClick={() => set({ door: colour })}
                    className={`h-7 w-7 rounded-full ring-2 ${style.door === colour || (!style.door && colour === DOOR_COLOURS[0]) ? "ring-slate-900" : "ring-slate-200"}`} style={{ background: colour }} />
                ))}
              </div>
            </div>
          </Group>

          {isHouse ? (
            <Group title="Garage">
              <Choice label="Garage" value={style.garage ?? "none"} onPick={(garage) => set({ garage })}
                options={canHaveGarage ? [["none", "None"], ["integral", "Built in"], ["single", "Single"], ["double", "Double"]] : [["none", "None"], ["integral", "Built in"]]} />
              {outsideGarage ? (
                <Choice label="The garage is" value={style.garageAttached === false ? "separate" : "joined"} onPick={(v) => set({ garageAttached: v === "joined" })}
                  options={[["joined", "Joined to the house"], ["separate", "Separate, down the side"]]} />
              ) : null}
              {style.garage && style.garage !== "none" && style.type !== "semi" && !(style.garage === "integral" && (style.doorSide ?? doorDefault) !== "centre") ? (
                <Choice label="Garage on the" value={style.garageSide} onPick={(garageSide) => set({ garageSide })} options={[["left", "Left"], ["right", "Right"]]} />
              ) : null}
              {style.garage && style.garage !== "none" ? (
                <Swatches label="Garage door" value={style.garageColour ?? GARAGE_COLOURS[0][0]} options={GARAGE_COLOURS} onPick={(garageColour) => set({ garageColour })} />
              ) : null}
            </Group>
          ) : null}

          <Group title="Front, drive and cars">
            {isHouse ? (
              <Choice label="Driveway" value={style.driveway ?? "none"} onPick={(driveway) => set({ driveway })}
                options={style.garage && style.garage !== "none" ? [["none", "None"], ["garage", style.garageAttached === false && outsideGarage ? "Down the side to the garage" : "In front of the garage"], ["house", "Beside the path"], ["full", "Whole front"]] : [["none", "None"], ["house", "Beside the path"], ["full", "Whole front"]]} />
            ) : null}
            {style.driveway && style.driveway !== "none" ? (
              <Choice label="Cars on the drive" value={cars as 0 | 1 | 2} onPick={(n) => set({ cars: n })} options={[[0, "None"], [1, "One"], [2, "Two"]]} />
            ) : null}
            {style.driveway && style.driveway !== "none"
              ? Array.from({ length: cars }, (_, i) => (
                <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-end gap-3">
                    <Choice label={cars === 2 ? `Car ${i + 1}` : "Car"} value={vehicle(i).body} onPick={(body) => setVehicle(i, { body })} options={CAR_BODIES} />
                    <Tick checked={vehicle(i).ev !== false} onChange={(ev) => setVehicle(i, { ev })}>Electric</Tick>
                  </div>
                  <Swatches label="Colour" value={vehicle(i).colour ?? CAR_COLOURS[0][0]} options={CAR_COLOURS} onPick={(colour) => setVehicle(i, { colour })} />
                </div>
              ))
              : null}
            <div className="flex flex-wrap gap-4">
              <Tick checked={style.grass !== false} onChange={(grass) => set({ grass })}>Lawn at the front</Tick>
              <Tick checked={style.shrubs !== false} onChange={(shrubs) => set({ shrubs })}>Shrubs</Tick>
            </div>
          </Group>

          <Group title="Extras">
            <div className="flex flex-wrap gap-4">
              <Tick checked={Boolean(style.solar)} onChange={(solar) => set({ solar })}>Solar panels</Tick>
              {isHouse ? <Tick checked={Boolean(style.charger)} onChange={(charger) => set({ charger })}>EV charger</Tick> : null}
            </div>
            {isHouse && style.charger && style.type !== "terraced" ? (
              <Choice label="Charger on the" value={style.chargerSide ?? "front"} onPick={(chargerSide) => set({ chargerSide })} options={[["front", "Front wall"], ["side", "Side wall"]]} />
            ) : null}
            <Choice label="Time of day" value={style.scene ?? "auto"} onPick={(scene) => set({ scene })} options={[["auto", "Follow the clock"], ["day", "Day"], ["night", "Night"]]} />
          </Group>

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
                    fd.set("style", JSON.stringify({ ...style, vehicles: Array.from({ length: cars }, (_, i) => vehicle(i)) }));
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
