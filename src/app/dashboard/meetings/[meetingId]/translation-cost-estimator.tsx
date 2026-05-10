"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD,
  estimateRealtimeTranslationCost,
} from "@/features/translation/cost-estimate";

const MINUTES_MIN = 1;
const MINUTES_MAX = 480;
const LANES_MIN = 1;
const LANES_MAX = 12;

export function TranslationCostEstimator() {
  const [minutes, setMinutes] = useState(60);
  const [lanes, setLanes] = useState(2);
  const estimate = useMemo(() => estimateRealtimeTranslationCost({ minutes, lanes }), [minutes, lanes]);

  return (
    <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Cost estimate</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">OpenAI realtime translation audio</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Estimate before inviting buyers. One lane means one source-language → one listening-language translated audio track.
            Multiple listeners sharing the same target language should reuse the same lane.
          </p>
        </div>
        <div className="rounded-2xl bg-cyan-50 px-5 py-4 text-right ring-1 ring-cyan-100">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Estimated translation cost</p>
          <p className="mt-1 text-3xl font-semibold text-slate-950">${estimate.estimatedUsd.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="translation-cost-minutes">
          Meeting minutes
          <input
            id="translation-cost-minutes"
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={minutes}
            onChange={(event) => setMinutes(clampNumber(event.target.value, MINUTES_MIN, MINUTES_MAX))}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>
        <label className="text-sm font-medium text-slate-700" htmlFor="translation-cost-lanes">
          Active translation lanes
          <input
            id="translation-cost-lanes"
            type="number"
            min={LANES_MIN}
            max={LANES_MAX}
            value={lanes}
            onChange={(event) => setLanes(clampNumber(event.target.value, LANES_MIN, LANES_MAX))}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <Detail label="Rate" value={`$${DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD.toFixed(3)} / minute / lane`} />
        <Detail label="Formula" value={`${minutes} min × ${lanes} lane${lanes === 1 ? "" : "s"}`} />
        <Detail label="Excludes" value="LiveKit, storage, transcripts, notes" />
      </dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function clampNumber(rawValue: string, min: number, max: number) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
