const sources = {
  digital: 'https://computationstructures.org/videos/digital/lecture.pdf',
  stacks: 'https://computationstructures.org/videos/stacks/lecture.pdf',
  node: 'https://www.intel.com/content/www/us/en/support/articles/000097598/processors.html',
  streams: 'https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html',
  sync: 'https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__STREAM.html',
  hopper: 'https://docs.nvidia.com/cuda/hopper-tuning-guide/index.html',
  peer: 'https://docs.nvidia.com/cuda/cuda-programming-guide/03-advanced/multi-gpu-systems.html',
  c2c: 'https://developer.nvidia.com/blog/nvidia-grace-hopper-superchip-architecture-in-depth',
};
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, size = 16) => `<text x="${x}" y="${y}" font-size="${size}" fill="#111110">${escape(value)}</text>`;
const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="#995600" stroke-width="2"/>`;
const box = (x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="#f5f3ee" stroke="#70706a"/>`;
const svg = (title, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${height}" font-family="Helvetica,Arial,sans-serif"><title>${escape(title)}</title><rect width="760" height="${height}" fill="#fff"/>${text(24, 30, title, 20)}${body}</svg>`;

const wrapLabel = (value, width) => {
  const lines=[]; let current='';
  for(const word of value.split(/\s+/)) {
    if(current && current.length+1+word.length>width){lines.push(current);current='';}
    if(word.length>width){if(current){lines.push(current);current='';} let remaining=word; while(remaining.length>width){const hyphen=remaining.lastIndexOf('-',width-1);const end=hyphen>0?hyphen+1:width;lines.push(remaining.slice(0,end));remaining=remaining.slice(end);}if(remaining)lines.push(remaining);}
    else current += (current ? ' ' : '')+word;
  }
  if(current)lines.push(current); return lines;
};
function restoreCaptionLabels(content) {
  const original=content.svgCode;
  if(!original.includes('viewBox="0 0 700 140"'))throw new Error(`Unexpected label-only SVG layout: ${content.name}`);
  const decode=s=>s.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const parts=[...new Set([/[:.;,]/,/[→,;:]/,/[,;]/].flatMap(re=>content.caption.split(re).map(s=>s.trim())))];
  const entries=[...original.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map(match=>{
    const before=decode(match[2]);let value=before;
    if(before.length>=17 && !parts.includes(before.trim())) {
      const options=parts.filter(p=>p.startsWith(before.trim()) && p.length>before.trim().length).sort((a,b)=>a.length-b.length);
      if(options.length){value=options[0]; if(value.split('(').length>value.split(')').length){const start=content.caption.indexOf(value),end=content.caption.indexOf(')',start+value.length);if(end>=0)value=content.caption.slice(start,end+1);}}
    }
    if(content.name==='truth_table_structure' && before==='one for each combi')value='one for each combination of A, B, C';
    return {match,before,value,title:match[1].includes('y="30"')};
  });
  const maxLines=Math.max(...entries.filter(e=>!e.title).map(e=>wrapLabel(e.value,15).length));
  const height=Math.max(50,maxLines*15+24),center=70+height/2;
  let result=original.replace('viewBox="0 0 700 140"',`viewBox="0 0 700 ${height+90}"`).replace('<rect width="700" height="140"',`<rect width="700" height="${height+90}"`).replaceAll('height="50"',`height="${height}"`).replaceAll('y1="95"',`y1="${center}"`).replaceAll('y2="95"',`y2="${center}"`);
  for(const e of entries){
    const x=e.match[1].match(/x="([^"]+)"/)[1],lines=wrapLabel(e.value,e.title?75:15);
    const y=e.title?30:center-(lines.length-1)*7.5;
    const attributes=e.match[1].replace(/y="[^"]+"/,`y="${y}"`).replace(/font-size="[^"]+"/,`font-size="${e.title?15:11}"`);
    result=result.replace(e.match[0],`<text${attributes}>${lines.map((line,i)=>`<tspan x="${x}" dy="${i?15:0}">${escape(line)}</tspan>`).join('')}</text>`);
  }
  content.svgCode=result;
  return entries.filter(e=>e.value!==e.before).map(e=>({before:e.before,after:e.value}));
}

export function correctComputation({ content, bank, legacy }) {
  const blocks = new Map(content.modules.flatMap(m => Object.values(m.lessonContent).flatMap(l => l.blocks)).map(b => [b.id, b]));
  const block = id => { if (!blocks.has(id)) throw new Error(`Missing computation block ${id}`); return blocks.get(id).content; };
  const question = (id, qid) => { const q = block(id).questions.find(q => q.id === qid); if (!q) throw new Error(`Missing ${id}/${qid}`); return q; };
  const keyed = q => q.options.find(o => o.isCorrect);
  const ref = key => `<p>Reference: <a href="${sources[key]}">${key === 'node' ? 'Intel process naming' : key === 'stacks' ? 'Computation Structures: procedures and stacks' : key === 'digital' ? 'Computation Structures: digital abstraction' : 'NVIDIA technical documentation'}</a>.</p>`;
  const findings = [];
  const done = (id, notes, verification) => findings.push({ id, status: 'corrected', notes, verification });

  question('m10-3-quiz1', 'q2').question = "What does BETAOP's expression (OP % 64) << 26, combined with shifted register fields, do?";
  keyed(question('m6-9-quiz1', 'q4')).text = 'No — 0.5 + 0.3 = 0.8 ns < 1.0 ns; the hold constraint is violated.';
  keyed(question('m18-6-quiz1', 'q5')).text = 'Latency targets, such as p99 < 100 ms, alongside other service requirements.';
  question('m18-6-quiz1', 'q5').explanation = 'A p99 latency target below 100 ms concerns the 99th percentile over a defined measurement window. It does not promise every request completes within 100 ms. The SLA must define its conditions and measurement method.';
  done('CS-01', 'Reconstructed three complete fields from their surrounding lessons/explanations. Desktop comp-module6/10/18-blocks.json already contain identical truncations; no intact original was recovered. Existing question and option IDs, including the two-option sets, are preserved.', 'Hold-time check: 0.5 + 0.3 = 0.8 < 1.0 ns; deficit 0.2 ns. Shift and less-than characters retained as plain text.');
  keyed(question('m3-8-quiz1', 'q1')).text = "The maximum guaranteed voltage for a valid logic-0 output, when the inverter input is a valid logic 1";
  done('CS-02', 'Aligned VOL option with the explanation and maximum-low-output definition.', sources.digital);
  block('m2-8-ex1').promptHtml = 'Decode <code>011110010</code> using A=11, B=0, C=100, D=101. Report the complete symbols and any incomplete suffix. What happens if one 0 bit is appended?';
  block('m2-8-ex1').placeholder = 'Check after working: B A A B B, with incomplete suffix 10; appending 0 completes C.';
  done('CS-03', 'Retained the original bit string as an explicit incomplete-codeword exercise, with checkable answer.', 'Greedy prefix decoding gives B,A,A,B,B + suffix10; 0111100100 gives B,A,A,B,B,C.');
  block('m4-1-t8').html = '<p>Modern process names such as “3 nm” identify technology generations; they do not state the channel length, smallest feature, or overall size of every transistor. Different dimensions and device structures must be specified separately. Increasing transistor density has enabled billions of transistors on a chip; Moore’s Law describes a historical trend, not a guaranteed physical law.</p>' + ref('node');
  const nodeQ = question('m4-1-quiz1', 'q4');
  nodeQ.question = 'What can you infer directly from a modern process name such as “3 nm”?';
  ['Every transistor is exactly 3 nm wide', 'Every gate has a 3 nm channel length', 'It identifies a process generation; actual dimensions require separate specifications', 'The chip measures 3 nm across'].forEach((value, i) => nodeQ.options[i].text = value);
  nodeQ.explanation = 'Modern node names are generation labels, not direct transistor measurements. Compare identified process specifications rather than deriving dimensions from the name.';
  done('CS-04', 'Removed physical-size/human-hair inference and replaced dimension-recall question.', sources.node);
  const frameQ = bank.find(q => q.id === 'cs-fe-016');
  if (!frameQ) throw new Error('Missing cs-fe-016');
  frameQ.explanation = 'SP moves as locals are allocated and nested calls run. BP remains the stable frame reference. In this upward-growing Beta stack, argument j is at BP - 4(j + 3), with j=0 for the first argument; local k is at BP + 4k, with k=0 for the first local. Saved LP is at BP-8 and saved BP at BP-4.';
  done('CS-05', 'Corrected private-bank frame offsets without activating the bank or editing legacy exam policy.', sources.stacks);
  block('m18-7-callout1').bodyHtml = '<p>CUDA stream priority is a scheduling hint for pending work. It does not preempt already executing work or guarantee an execution order or deadline. A long-running kernel can therefore still delay urgent work. Hardware or context preemption is a different capability and must not be inferred from a stream-priority setting.</p>' + ref('streams');
  const priorityQ = question('m18-7-quiz1', 'q3');
  priorityQ.question = 'What do CUDA stream priorities provide?';
  keyed(priorityQ).text = 'A scheduling hint for pending work, without preemption of already executing work or deadline guarantees';
  priorityQ.explanation = 'Stream priority does not turn a weak scheduling system into guaranteed preemptive real-time scheduling. It is a hint, and memory transfers may not respect it.';
  done('CS-06', 'Removed guaranteed preemption claim from prose and quiz.', sources.streams);
  block('m18-5-callout1').bodyHtml = '<p><code>cudaStreamSynchronize()</code> waits for preceding work in the stream to finish. The host waiting strategy depends on scheduling configuration: it may spin, yield, or block. A context configured with <code>cudaDeviceScheduleBlockingSync</code> illustrates a blocking wait; this does not promise zero CPU usage for the whole process. CUDA stream “blocking/non-blocking” flags instead describe synchronization with the legacy default stream.</p>' + ref('sync');
  const syncQ = question('m18-5-quiz1', 'q3');
  syncQ.question = 'What does cudaStreamSynchronize() guarantee?';
  keyed(syncQ).text = 'The call waits for preceding work in that stream to complete; host waiting strategy depends on configuration';
  syncQ.explanation = 'Completion waiting is guaranteed. Always sleeping or zero process CPU utilization is not; scheduling flags influence host spin, yield or blocking behavior.';
  done('CS-07', 'Separated completion semantics, host wait strategy and default-stream flags.', sources.sync);
  block('m20-3-callout1').bodyHtml = '<p>Compare bandwidth in the same direction. A theoretical PCIe 4.0 ×16 link offers about 32 GB/s one way, so 1 decimal GB takes about 31.25 ms before overhead. H100’s 18 fourth-generation NVLink links total 900 GB/s bidirectionally: under a symmetric split, the one-way aggregate ceiling is 450 GB/s, or about 2.22 ms per 1 GB. This is a per-GPU aggregate ceiling, not a guaranteed transfer rate between a pair of GPUs. Link topology, contention and protocol overhead determine achieved throughput.</p>' + ref('hopper');
  const bwQ = question('m20-3-quiz1', 'q3');
  bwQ.question = 'Why can a suitably connected H100 NVLink system help communication-heavy multi-GPU training?';
  keyed(bwQ).text = 'It can provide more inter-GPU bandwidth, but one-way rates and the actual topology must be compared consistently';
  bwQ.explanation = '900 GB/s is H100’s aggregate bidirectional NVLink rating, not a one-way pair-transfer rate. The ideal symmetric one-way aggregate is 450 GB/s; real communication must be measured on its topology.';
  question('m20-3-quiz1','q1').question = 'What is the approximate theoretical one-way bandwidth of PCIe 4.0 ×16 before protocol overhead?';
  done('CS-08', 'Corrected directional bandwidth arithmetic and removed pair-transfer/speedup guarantee.', '1/32 seconds =31.25ms; 1/450 seconds =2.222ms. '+sources.hopper);
  block('m19-5-ill1').caption = 'Producer: WAIT(SPACES) → write → SIGNAL(CHARS). Consumer: WAIT(CHARS) → read → SIGNAL(SPACES). CHARS + SPACES = N only when no operations hold reservations. In general add producer and consumer reservations to obtain N.';
  block('m19-5-callout2').bodyHtml = '<p>1. Why does CHARS + SPACES = N hold only at checkpoints with no in-flight reservations?</p><p>2. For N=4, after WAIT(SPACES) succeeds but before SIGNAL(CHARS), CHARS=0 and SPACES=3. Where is the fourth slot accounted for?</p><p>3. What goes wrong if an empty buffer starts with CHARS=N and SPACES=0?</p>';
  const semQ = question('m19-5-quiz1','q4');
  semQ.question = 'With counting semaphores for an N-slot buffer, when does CHARS + SPACES = N hold?';
  keyed(semQ).text = 'At checkpoints with no producer or consumer reservations in flight';
  semQ.explanation = 'A successful WAIT reserves a slot until the corresponding SIGNAL. The general invariant is CHARS + SPACES + producer reservations + consumer reservations = N. For N=4 after producer WAIT, 0+3+1+0=4.';
  done('CS-09', 'Updated caption, reflection, quiz and diagram to account for reservations.', 'N=4 transition trace preserves CHARS+SPACES+producerReserved+consumerReserved=4.');

  const branchRows = [['BNE at PC', 'IF', 'RF: taken', 'EX', 'MEM', 'WB'], ['Wrong PC+4', '', 'IF', 'NOP', 'NOP', 'NOP'], ['Branch target', '', '', 'IF', 'RF', 'EX']];
  block('m15-7-ill1').svgCode = svg('Taken branch resolved in RF', 310, [text(22,68,'Instruction'), ...[2,3,4,5,6].map((v,i)=>text(240+i*98,68,`Cycle ${v}`,14)), ...branchRows.flatMap((row,r)=>[text(22,110+r*53,row[0]), ...row.slice(1).flatMap((v,i)=>[box(230+i*98,87+r*53,92,40),text(237+i*98,112+r*53,v,13)])]), text(24,273,'At cycle 3, annul PC+4 and redirect fetch to the branch target.',15)].join(''));
  block('m19-5-ill1').svgCode = svg('Two semaphores with in-flight reservations', 320, [text(55,65,'Producer'),text(420,65,'Consumer'), ...[['WAIT(SPACES)','WAIT(CHARS)'],['Write reserved slot','Read reserved item'],['SIGNAL(CHARS)','SIGNAL(SPACES)']].flatMap((row,r)=>row.flatMap((v,c)=>[box(50+c*365,80+r*57,295,42),text(65+c*365,107+r*57,v), ...(r<2?[line(195+c*365,123+r*57,195+c*365,136+r*57)]:[])])),text(24,281,'CHARS + SPACES + producer reservations + consumer reservations = N',16),text(24,306,'Without reservations: CHARS + SPACES = N',14)].join(''));
  block('m20-11-ill1').svgCode = svg('MESI: write invalidation, then a peer read', 335, [text(25,68,'Event'),text(330,68,'Core 0'),text(548,68,'Core 1'), ...[['Initially: X = 0','S : X=0','S : X=0'],['Core 0 obtains ownership; writes 3','M : X=3','I'],['Core 1 reads; misses','supplies X=3','read request'],['After shared response / write-back','S : X=3','S : X=3']].flatMap((row,r)=>[text(25,103+r*52,row[0],14),box(320,79+r*52,185,40),text(332,104+r*52,row[1],14),box(538,79+r*52,190,40),text(550,104+r*52,row[2],14)]),text(24,316,'Simplified snooping MESI; coherence alone does not impose a memory-ordering model.',14)].join(''));
  block('m12-6-ill1').svgCode = svg('Beta stack: fixed BP offsets (two-local example)', 400, [text(28,63,'Higher addresses; stack grows upward ↑',15), ...[['BP+8','Saved registers (example)'],['BP+4','Local 1'],['BP+0','Local 0 ← BP'],['BP−4','Saved BP'],['BP−8','Saved LP'],['BP−12','Argument 0'],['BP−16','Argument 1']].flatMap((row,r)=>[text(95,98+r*37,row[0]),box(220,75+r*37,450,34),text(239,98+r*37,row[1])]),text(25,363,'Argument j: BP − 4(j+3)     Local k: BP + 4k     j,k start at 0',16),text(25,388,'SP moves with allocation/calls; BP stays fixed within this activation.',15)].join(''));
  const labelAudit = ["m5-2-ill1", "m5-3-ill1", "m5-4-ill1", "m5-5-ill1", "m5-11-ill1", "m6-1-ill1", "m6-3-ill1", "m6-6-ill1", "m6-8-ill1", "m7-4-ill1", "m8-5-ill1", "m8-6-ill1", "m8-9-ill1", "m8-10-ill1", "m9-3-ill1", "m9-4-ill1", "m9-7-ill1", "m9-8-ill1", "m9-11-ill1", "m10-6-ill1", "m10-8-ill1", "m10-9-ill1", "m10-10-ill1", "m10-11-ill1", "m11-3-ill1", "m11-4-ill1", "m11-5-ill1", "m11-6-ill1", "m12-1-ill1", "m12-2-ill1", "m12-3-ill1", "m12-7-ill1", "m12-8-ill1", "m13-1-ill1", "m13-2-ill1", "m13-3-ill1", "m13-4-ill1", "m13-6-ill1", "m13-7-ill1", "m13-9-ill1", "m13-10-ill1", "m14-1-ill1", "m14-2-ill1", "m14-4-ill1", "m14-5-ill1", "m14-6-ill1", "m14-8-ill1", "m14-9-ill1", "m15-1-ill1", "m15-6-ill1", "m15-8-ill1", "m16-2-ill1", "m16-3-ill1", "m16-4-ill1", "m16-5-ill1", "m16-6-ill1", "m16-8-ill1", "m17-2-ill1", "m17-4-ill1", "m17-6-ill1", "m17-9-ill1", "m18-3-ill1", "m18-6-ill1", "m18-8-ill1", "m18-9-ill1", "m19-1-ill1", "m19-2-ill1", "m19-3-ill1", "m19-4-ill1", "m19-6-ill1", "m19-7-ill1", "m19-9-ill1", "m20-1-ill1", "m20-2-ill1", "m20-4-ill1", "m20-6-ill1", "m20-8-ill1", "m20-9-ill1"].map(id => ({blockId:id, labels:restoreCaptionLabels(block(id))}));
  done('CS-10', 'Replaced four defective SVGs at original block positions with branch timeline, parallel semaphore sequences, MESI state transitions and a real Beta frame layout. Restored complete caption-derived labels in all other 78 heuristic candidates, with wrapped text and resized boxes/viewBoxes; preserved their source box/arrow sequences. These are label repairs, not mechanism redesigns.', 'SVG XML validity and label/layout checks; original block IDs and captions retained except corrected semaphore invariant.');
  const vtcQ = question('m3-8-quiz1','q5');
  vtcQ.options.forEach(o=>o.isCorrect=o.id==='D');
  vtcQ.explanation = 'VIN=1.0 V lies between VIL=0.75 V and VIH=1.25 V. That single point imposes no static-discipline requirement, but it says nothing about the curve for valid low or high inputs. Whole-curve legality cannot be determined from it.';
  done('CS-11', 'Kept the whole-curve question and keyed insufficient information (D).', sources.digital);
  block('m14-3-callout1').bodyHtml = '<p>Programmer-managed shared memory lets a CUDA kernel reuse tiles near computation. H100 (compute capability 9.0) supports up to 228 KB of shared memory per SM; 164 KB is one selectable carveout, not its maximum. Shared memory capacity per block and occupancy impose further limits. Data reuse can improve performance, but the speedup depends on the kernel and must be measured.</p>'+ref('hopper');
  const sharedQ = question('m14-3-quiz1','q2');
  sharedQ.question = 'CUDA shared memory on H100 is best described as:';
  keyed(sharedQ).text = 'Programmer-managed on-chip storage; up to 228 KB per SM, with selectable carveouts including 164 KB';
  sharedQ.explanation = 'The H100 maximum is 228 KB per SM, not 164 KB. Capacity per thread block and carveout configuration impose separate constraints.';
  done('CS-N02','Clarified H100 capacity and removed unsourced universal speedup claim.',sources.hopper);
  const peerCopy = '<p>Ordinary multi-GPU NVLink peer access is not a promise of transparent MESI-style cache coherence between all GPUs. Peer access and supported atomics still require synchronization and appropriate memory scopes; check device capabilities. Grace Hopper is a distinct example: its CPU and GPU use the coherent NVLink-C2C interconnect. Do not transfer that claim to every GPU-to-GPU NVLink connection.</p>'+ref('peer')+ref('c2c');
  block('m14-9-callout1').bodyHtml = peerCopy;
  block('m20-11-callout1').bodyHtml = '<p>Cache coherence keeps copies of individual memory locations consistent. It does not by itself guarantee sequential consistency, remove data races, or replace program synchronization.</p>'+peerCopy;
  for (const [bid,qid] of [['m14-9-quiz1','q4'],['m20-11-quiz1','q3']]) {
    const q=question(bid,qid); q.question='What is required when using GPU-to-GPU peer memory over NVLink?'; keyed(q).text='Supported peer access plus correct synchronization and memory scopes; do not assume universal MESI coherence'; q.explanation='Peer access and a coherent CPU-GPU NVLink-C2C system are different capabilities. Query support and follow CUDA memory-consistency rules.';
  }
  question('m20-11-quiz1','q4').explanation = 'Sequential consistency means a single interleaving preserves each thread’s program order. Cache coherence alone orders accesses to each location; it does not guarantee this stronger model for all locations. Program synchronization and the architecture’s memory model still matter.';
  done('CS-N03','Corrected the four named GPU coherence analogies and adjacent sequential-consistency explanation. Broader empirical performance claims remain for technical review.',sources.peer+' ; '+sources.c2c);
  const firstLesson = content.modules[0].lessonContent[content.modules[0].subItems[0]];
  firstLesson.blocks.push({ id: 'armature-cs-source-credits-r1', type: 'text', content: { html: '<p><strong>Learning references and credits.</strong> This Armature adaptation preserves the authored Learning Platform course structure. The Beta architecture and foundational teaching references are from <a href="https://computationstructures.org/">Computation Structures</a>. Updated hardware examples link to manufacturer documentation in the relevant lessons. These credits identify references; they do not claim endorsement or grant reuse permissions.</p>' } });
  findings.push({id:'CS-N01',status:'deferred',notes:'Private bank remains unapproved. Legacy exam, including inherited timing/pass defaults and out-of-syllabus items, is preserved as private history and never activated by this correction.',verification:`Legacy input retained unchanged (${Array.isArray(legacy) ? legacy.length : 'structured'} entries).`});
  findings.push({id:'CS-N04',status:'deferred',notes:'Seven illustration-free lessons remain unchanged: existing number tables suffice as interim visual aids; CMOS inversion and FSM mechanisms need separate diagram authoring. No diagram was invented merely to meet a quota.',verification:'Review appendix preserves all seven lesson IDs.'});
  findings.push({id:'CS-N05',status:'partial',notes:'Added learner-facing credits; source-permission confirmation and workload pilot remain open. No new duration or license claim.',verification:'One stable-ID credit block appended to the introductory lesson.'});
  findings.find(f=>f.id==='CS-10').labelAudit=labelAudit;
  return findings;
}
