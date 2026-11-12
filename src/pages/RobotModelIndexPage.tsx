import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./RobotModelIndexPage.css";

const repoUrl = "https://github.com/armature-ai-labs/robot-model-index";
const dataUrl = "https://armature-ai-labs.github.io/robot-model-index";

type Price = { unit: string; input?: number; output?: number } | null;
type Provider = { provider_name: string; kind: string; access: string; current_price?: Price };
type Fit = { device: string; status: string; result: string };
type IndexModel = {
  id: string;
  name: string;
  developer: string;
  roles: string[];
  lifecycle: string;
  last_verified: string;
  access: { type: string[] };
  licence: { commercial_use: string };
  hardware?: { fit?: Fit[] };
  providers: Provider[];
};
type IndexMeta = { built_at: string; commit: string; counts: { models: number; providers: number; licences: number } };
type IndexFile = { meta: IndexMeta; models: IndexModel[] };
type LoadState = { status: "loading" } | { status: "ready"; data: IndexFile } | { status: "error" };

const roleLabels: Record<string, string> = {
  "frontier-llm": "Frontier model",
  "embodied-reasoning": "Embodied reasoning",
  vla: "VLA",
  "world-model": "World model",
  "world-action-model": "World action model",
  "edge-llm": "Edge LLM",
  vlm: "VLM",
  "speech-asr": "Speech to text",
  "speech-tts": "Text to speech",
  perception: "Perception",
  "reward-model": "Reward model"
};

const accessLabels: Record<string, string> = {
  "open-weights": "Open weights",
  "public-api": "Public API",
  waitlist: "Waitlist",
  "partners-only": "Partners only",
  "research-only": "Research only",
  "not-available": "Not available"
};

const commercialLabels: Record<string, string> = { yes: "Yes", conditional: "Conditional", no: "No", unclear: "Unclear" };

const questions = [
  { q: "What does it do?", a: "Its role in a robot: planner, embodied reasoning, VLA, world model, speech or perception, and what it outputs." },
  { q: "How do I get it?", a: "Open weights, public API, waitlist or partners only, and from which providers." },
  { q: "What does it cost, and until when?", a: "Prices with start and end dates. Gemini Robotics ER 2 costs $1 / $5 per million tokens through 31 December 2026, then $2 / $10." },
  { q: "Can I use it commercially?", a: "The whole licence chain: code, weights, base models and training data, with a plain answer and the reason." },
  { q: "Will it run on my robot’s computer?", a: "Hardware fit per device, marked as measured by Armature, reported by the community, claimed by the vendor, or untested." },
  { q: "What’s the catch?", a: "Limitations and key terms, each with its source: preview status, gating, safety responsibilities, numerical drift." }
];

const inReview: { group: string; models: { name: string; drafted?: boolean }[] }[] = [
  { group: "Frontier models used as robot brains", models: [{ name: "Claude Fable 5.2" }, { name: "Claude Opus 5.5" }, { name: "GPT-6 Astra" }] },
  { group: "Embodied reasoning", models: [{ name: "Gemini Robotics ER 2", drafted: true }, { name: "Cosmos-Reason2" }] },
  { group: "VLAs with open weights", models: [{ name: "SmolVLA", drafted: true }, { name: "π0" }, { name: "π0.5", drafted: true }, { name: "GR00T N1.7" }, { name: "OpenVLA-OFT" }, { name: "X-VLA" }, { name: "MolmoAct2" }] },
  { group: "VLAs with gated access", models: [{ name: "Gemini Robotics 2" }, { name: "π0.7" }] },
  { group: "World action models", models: [{ name: "Cosmos 3" }, { name: "DreamZero" }, { name: "LingBot-VA" }] },
  { group: "Speech and small models", models: [{ name: "Whisper large-v3-turbo" }, { name: "Qwen3.5-4B" }, { name: "SmolVLM2" }] }
];

const rules = [
  ["Primary sources only", "Developer docs, model cards, licence files, pricing pages, papers and code. No aggregator sites."],
  ["Every fact cites its source", "Each claim points to a dated source in the same entry. The validator rejects anything that doesn’t."],
  ["Community numbers stay in their lane", "Independent measurements may back hardware fit and benchmarks, never licences, access or prices."],
  ["Nothing goes live unchecked", "AI can draft an entry. A person checks every claim against its source before it is published."],
  ["Not legal advice", "Licence summaries are plain-language aids. Read the original and ask a lawyer before you rely on one."]
];

const endpoints = [
  ["index.json", "Every published model with its providers and today’s price"],
  ["models/<model-id>.json", "One model"],
  ["licences.json", "Plain-language licence summaries"],
  ["meta.json", "Build time, commit and counts"]
];

function formatDate(value: string) {
  const date = new Date(value.length === 7 ? `${value}-01` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function priceToday(model: IndexModel) {
  const prices = model.providers.map(provider => provider.current_price).filter((price): price is NonNullable<Price> => Boolean(price));
  const paid = prices.find(price => price.unit === "usd_per_million_tokens" && price.input !== undefined && price.output !== undefined);
  if (paid) return `$${paid.input} / $${paid.output} per 1M tokens`;
  if (prices.some(price => price.unit === "free")) return "Free download";
  return "Not listed";
}

function jetsonFit(model: IndexModel) {
  const fit = model.hardware?.fit?.find(item => item.device === "jetson-orin-nano-8gb");
  if (!fit) return "Not tested";
  return { "measured-by-armature": "Measured by Armature", "community-reported": "Community-reported", "vendor-claimed": "Vendor claim", untested: "Not tested" }[fit.status] ?? fit.status;
}

function useIndex(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${dataUrl}/index.json`, { signal: controller.signal, cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<IndexFile>;
      })
      .then(data => setState({ status: "ready", data }))
      .catch(error => { if (!controller.signal.aborted) { console.warn("Robot Model Index unavailable", error); setState({ status: "error" }); } });
    return () => controller.abort();
  }, []);
  return state;
}

export function RobotModelIndexPage() {
  const index = useIndex();
  const published = index.status === "ready" ? index.data.models : [];

  return <article className="wrap rmi-page">
    <nav className="rmi-crumb" aria-label="Breadcrumb"><Link to="/resources">Resources</Link><span aria-hidden="true">/</span><span>Robot Model Index</span></nav>

    <section className="rmi-hero" aria-labelledby="rmi-title">
      <div className="rmi-hero-copy">
        <p className="rmi-kicker">Open dataset, Apache 2.0</p>
        <h1 id="rmi-title">Robot Model Index</h1>
        <p className="rmi-lede">AI models for robots, from LLMs to VLAs and world models. What each one does, how to get it, what it costs, whether you can use it commercially, what it runs on, and what the catch is. Every fact sourced and dated.</p>
        <div className="rmi-actions">
          <a className="rmi-button" href={repoUrl}>View on GitHub <span aria-hidden="true">↗</span></a>
          <a href="#rmi-data">Use the data</a>
        </div>
        <p className="rmi-status" aria-live="polite">
          {index.status === "loading" && "Checking the published index…"}
          {index.status === "error" && "Couldn’t reach the published index just now."}
          {index.status === "ready" && <>{index.data.meta.counts.models} verified {index.data.meta.counts.models === 1 ? "entry" : "entries"} published. Last build {formatDate(index.data.meta.built_at)}.</>}
        </p>
      </div>

      <figure className="rmi-chain">
        <figcaption>Why every entry traces the whole licence chain</figcaption>
        <ol>
          <li><span>π0.5 code (openpi)</span><strong>Apache 2.0</strong></li>
          <li><span>π0.5 checkpoints</span><strong>Licence not stated</strong></li>
          <li><span>Built on</span><strong>PaliGemma</strong></li>
          <li><span>Which brings</span><strong>Gemma Terms of Use</strong><em>Use restrictions that must be passed on to anyone you redistribute to</em></li>
        </ol>
        <p className="rmi-verdict"><span>Commercial use</span><strong>Conditional</strong></p>
        <p className="rmi-chain-source">Sources: <a href="https://github.com/Physical-Intelligence/openpi">openpi</a>, <a href="https://arxiv.org/abs/2504.16054">π0.5 paper</a>, <a href="https://ai.google.dev/gemma/terms">Gemma Terms</a>. Not legal advice.</p>
      </figure>
    </section>

    <section className="rmi-section" aria-labelledby="rmi-questions">
      <h2 id="rmi-questions">Six questions, answered for every model</h2>
      <dl className="rmi-questions">
        {questions.map(item => <div key={item.q}><dt>{item.q}</dt><dd>{item.a}</dd></div>)}
      </dl>
    </section>

    <section className="rmi-section" aria-labelledby="rmi-index-heading">
      <h2 id="rmi-index-heading">The index</h2>
      {index.status === "ready" && published.length > 0 && <div className="rmi-table-scroll">
        <table className="rmi-table">
          <caption>Published entries, read live from the open dataset</caption>
          <thead><tr><th scope="col">Model</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Commercial use</th><th scope="col">Price today</th><th scope="col">Jetson Orin Nano 8 GB</th><th scope="col">Verified</th></tr></thead>
          <tbody>
            {published.map(model => <tr key={model.id}>
              <th scope="row"><a href={`${repoUrl}/blob/main/models/${model.developer}/${model.id}.toml`}>{model.name}</a></th>
              <td>{model.roles.map(role => roleLabels[role] ?? role).join(", ")}</td>
              <td>{model.access.type.map(type => accessLabels[type] ?? type).join(", ")}</td>
              <td><span className={`rmi-commercial is-${model.licence.commercial_use}`}>{commercialLabels[model.licence.commercial_use] ?? model.licence.commercial_use}</span></td>
              <td>{priceToday(model)}</td>
              <td>{jetsonFit(model)}</td>
              <td>{formatDate(model.last_verified)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {(index.status !== "ready" || published.length === 0) && <div className="rmi-empty">
        <p>{index.status === "error"
          ? <>The published data couldn’t be loaded. You can read every entry directly <a href={repoUrl}>on GitHub</a>.</>
          : "Nothing is published yet. An entry goes live only after a person has checked every claim against its source. The first 20 are in review now."}</p>
        <p><a href={`${repoUrl}/issues/new?template=request-model.yml`}>Request a model</a></p>
      </div>}

      {published.length < 20 && <div className="rmi-review" aria-label="Models in review">
        {inReview.map(group => <div key={group.group} className="rmi-review-group">
          <h3>{group.group}</h3>
          <ul>{group.models.map(model => <li key={model.name}>{model.name}<span className={model.drafted ? "is-drafted" : ""}>{model.drafted ? "Drafted, in review" : "Queued"}</span></li>)}</ul>
        </div>)}
      </div>}
    </section>

    <section className="rmi-section" aria-labelledby="rmi-rules">
      <h2 id="rmi-rules">The rules we hold it to</h2>
      <dl className="rmi-rules">
        {rules.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}
      </dl>
    </section>

    <section className="rmi-section" id="rmi-data" aria-labelledby="rmi-data-heading">
      <h2 id="rmi-data-heading">Use the data</h2>
      <p className="rmi-intro">Verified entries are published as static JSON on every change. Read them from your own tools, or from <span className="rmi-code">commutator models sync</span> once Commutator, our open-source AI gateway for robots, ships.</p>
      <ul className="rmi-endpoints">
        {endpoints.map(([file, detail]) => <li key={file}>
          {file.includes("<") ? <code>{dataUrl}/{file}</code> : <a href={`${dataUrl}/${file}`}><code>{dataUrl}/{file}</code></a>}
          <span>{detail}</span>
        </li>)}
      </ul>
      <div className="rmi-contribute">
        <a href={`${repoUrl}/blob/main/CONTRIBUTING.md`}>Contribute an entry</a>
        <a href={`${repoUrl}/issues/new?template=request-model.yml`}>Request a model</a>
        <a href={`${repoUrl}/issues/new?template=correction.yml`}>Report a correction</a>
      </div>
      <p className="rmi-note">Code and data are Apache 2.0. Keep the NOTICE file when you reuse the data.</p>
    </section>
  </article>;
}
