const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const label = (x, y, text, size = 16) => `<text x="${x}" y="${y}" fill="#111110" font-family="Arial,sans-serif" font-size="${size}" text-anchor="middle">${esc(text)}</text>`;
const svg = (title, body, height = 280) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 ${height}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="840" height="${height}" fill="#fff"/>${body}</svg>`;
const curve = (fn, min, max, x, y, width, height, ymin, ymax) => `<polyline fill="none" stroke="#995600" stroke-width="3" points="${Array.from({ length: 161 }, (_, i) => { const t = min + (max - min) * i / 160; return `${(x + width * i / 160).toFixed(2)},${(y + height * (ymax - fn(t)) / (ymax - ymin)).toFixed(2)}`; }).join(' ')}"/>`;
const axes = (x, y, w, h) => `<path d="M${x} ${y}v${h}h${w}" fill="none" stroke="#777"/>`;

export function correctMathematics({ content, bank, legacy }) {
  const blocks = content.modules.flatMap((m) => Object.values(m.lessonContent).flatMap((l) => l.blocks));
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const questions = new Map(blocks.filter((b) => b.type === 'quiz').flatMap((b) => b.content.questions).map((q) => [q.id, q]));
  const b = (id) => { if (!byId.has(id)) throw new Error(`Missing mathematics block ${id}`); return byId.get(id).content; };
  const q = (id) => { if (!questions.has(id)) throw new Error(`Missing mathematics question ${id}`); return questions.get(id); };
  const html = (id, text) => { b(id).html = `<p>${text}</p>`; };
  const correctOption = (id, text) => { q(id).options.find((o) => o.isCorrect).text = text; };
  const illustration = (id, caption, svgCode) => { byId.get(id).content = { caption, svgCode }; };
  const findings = [];
  const done = (n, notes, verification) => findings.push({ id: `MATH-${String(n).padStart(2, '0')}`, status: 'corrected', notes, verification });

  q('m6-6-1-q5').question = '<p>If the feature matrix has rank less than its number of columns, what follows?</p>';
  q('m7-7-4-q3').question = '<p>If f′(a) = 0 and f″(a) &lt; 0, what kind of point is a?</p>';
  q('m12-12-3-q1').question = '<p>For X ~ Uniform(0, 10), what is P(3 &lt; X &lt; 7)?</p>';
  q('m12-12-3-q1').explanation = 'A uniform probability is interval length divided by total length: (7 − 3) / 10 = 0.4.';
  done(1, 'Reconstructed three stems from intact answers/explanations; Desktop Learning Platform module JSON and course JSON repeat the truncation. This is adapted wording, not recovered verbatim source.', 'Rank deficiency gives dependent columns; the stationary second-derivative maximum test applies; uniform interval probability is 0.4.');

  q('m13-13-1-q1').options = [
    { id: 'A', text: 'P(A ∩ B) by adding P(A) and P(B)', isCorrect: false },
    { id: 'B', text: 'P(A | B) from P(B | A), P(A), and P(B)', isCorrect: true },
    { id: 'C', text: 'P(A) + P(B) for every pair of events', isCorrect: false },
    { id: 'D', text: 'P(not A) without knowing anything about A', isCorrect: false },
  ];
  q('m13-13-1-q1').explanation = 'For P(B) > 0, Bayes’ theorem gives P(A | B) = P(B | A) P(A) / P(B). It reverses the conditioning using the prior and the evidence probability.';
  done(2, 'Reconstructed four unique A–D options; source module JSON has the same duplicate/empty fragments. Retained the question ID and correct answer B; removed the spurious fifth duplicate-A option.', 'One correct answer, unique nonempty options; Bayes denominator condition explicit.');

  b('m5-4-code1').code = b('m5-4-code1').code.replace('# [1, 2] → x=1, y=2', '# [-0.2, 2.8] → x=-0.2, y=2.8').replace('# [1, 2]', '# [-0.2, 2.8]') + '\n# Substitution: 2*(-0.2) + 3*2.8 = 8; -0.2 + 4*2.8 = 11';
  done(3, 'Corrected both output comments and added substitution verification; equations unchanged.', 'A @ [-0.2, 2.8] = [8, 11].');
  b('m3-4-code1').code = b('m3-4-code1').code.replace('# 4.47', '# 4.899');
  done(4, 'Corrected distance output.', 'sqrt(24) = 4.898979..., formatted to three decimals is 4.899.');
  b('m9-4-code1').code = b('m9-4-code1').code.replace('import numpy as np', 'import math\nimport numpy as np').replace('np.math.factorial', 'math.factorial');
  done(5, 'Uses the Python standard-library factorial instead of removed np.math.', 'Ten terms at x=1 give 2.718282 to six decimals.');

  html('m5-3-t3', 'A square matrix A is invertible if and only if det(A) ≠ 0. Equivalently, its columns are linearly independent and Ax = 0 has only x = 0. Numerical sensitivity is measured by the <strong>condition number</strong>, not the determinant magnitude alone. A large condition number means small relative perturbations can cause large relative solution changes. Use <code>np.linalg.cond(A)</code>: for (10⁻¹⁰)I the determinant is tiny but the 2-norm condition number is 1; diag(10¹⁰, 10⁻¹⁰) has determinant 1 but condition number 10²⁰. Prefer solving Ax = b directly to explicitly forming an inverse.');
  correctOption('m5-5-3-q5', 'A large condition number, so small relative input perturbations can cause large relative solution changes');
  q('m5-5-3-q5').explanation = 'Ill-conditioning is relative sensitivity, measured by a large condition number. Determinant magnitude depends on scaling and is not a reliable test.';
  done(6, 'Replaced determinant shortcut with relative condition-number definition and counterexamples.', 'Scaled identity has condition 1; reciprocal diagonal entries yield condition 1e20 despite determinant 1.');

  b('m2-3-def1').definitionHtml = 'A set V over a field (such as the real numbers), equipped with vector addition and scalar multiplication, satisfying closure, the additive-group laws, compatibility of scalar multiplication, scalar identity 1v = v, and both distributive laws. Counts differ according to how these properties are grouped; the full laws matter.';
  b('m2-3-tab1').rows.push(['9', 'Scalar identity', '1v = v for every v in V']);
  q('m2-2-3-q1').question = '<p>Which is the scalar identity law required in a vector space?</p>';
  q('m2-2-3-q1').options.forEach((o, i) => { o.text = ['0v = v for every v', '1v = 0 for every v', '1v = v for every v', 'av = v for every scalar a'][i]; });
  q('m2-2-3-q1').explanation = 'Multiplication by the field’s multiplicative identity leaves every vector unchanged: 1v = v. Closure and the other laws are also required.';
  b('m2-3-ill1').caption = 'A vector space is closed under vector addition and scalar multiplication and obeys all the listed laws, including scalar identity 1v = v. The number of rows depends on how the laws are grouped.';
  done(7, 'Added missing scalar identity and replaced count memorisation with the actual property.', 'Nine rows with grouped distributive laws cover closure and all vector-space laws.');

  html('m7-1-t3', 'A function is <strong>continuous</strong> at a if f(a) is defined, lim(x→a) f(x) exists, and the limit equals f(a). Continuity does not imply differentiability: ReLU is continuous but has no derivative at its kink at 0, and there are even continuous functions differentiable nowhere. Gradient methods therefore need differentiable objectives or explicit rules for the nonsmooth points of piecewise-differentiable objectives.');
  done(8, 'Removed the false almost-everywhere implication.', 'ReLU supplies an elementary counterexample to differentiability everywhere; continuous nowhere-differentiable functions rule out the stronger assertion.');

  html('m7-4-t3', 'For a twice continuously differentiable multivariable function, the <strong>Hessian</strong> Hᵢⱼ = ∂²f/∂xᵢ∂xⱼ describes local curvature. <strong>At a stationary point (∇f = 0)</strong>, a positive-definite Hessian gives a strict local minimum, a negative-definite Hessian a strict local maximum, and an indefinite Hessian a saddle. A semidefinite Hessian is inconclusive. In one variable, f″(a) = 0 is also inconclusive: x⁴ at 0 has a minimum without a concavity change. An inflection requires a change of concavity. A full Hessian is expensive for large neural networks.');
  q('m7-7-2-q5').question = '<p>At a stationary point of a differentiable function, the derivative equals:</p>';
  q('m7-7-2-q5').explanation = 'A stationary point has derivative zero. It may be a local minimum, local maximum or neither. The broader term critical point can also include points where the derivative is undefined.';
  illustration('m7-4-ill1', 'Actual graphs of x², −x² and x⁴ on [−1, 1]. Although (x⁴)″ = 0 at the origin, its concavity does not change there: zero second derivative alone does not establish an inflection.', svg('Second derivative and the inconclusive zero case', [
    ['x²: f″ = 2 > 0', (x) => x*x, 'Concave up'], ['−x²: f″ = −2 < 0', (x) => -x*x, 'Concave down'], ['x⁴: f″(0) = 0', (x) => x**4, 'Still concave up; no inflection'],
  ].map(([title, fn, foot], i) => label(140+i*280, 30, title) + axes(30+i*280, 60, 220, 150) + curve(fn, -1, 1, 30+i*280, 60, 220, 150, -1, 1) + label(140+i*280, 240, foot, 14)).join('')));
  b('m10-1-code1').code = b('m10-1-code1').code.replace('else "inflection"', 'else "inconclusive"');
  done(9, 'Added stationary/smoothness assumptions, inconclusive cases and an actual x⁴ counterexample diagram; corrected the generic code fallback too.', 'x⁴ has f″(0)=0 but f″(x)=12x²≥0 on both sides.');

  html('m7-4-t4', 'Curvature influences sensible step sizes: a steeply curved direction may require a smaller step. <strong>Newton’s method</strong> explicitly uses a Hessian to transform the gradient. <strong>Adam</strong> is a first-order method: it tracks moving averages of gradients and squared gradients, with bias corrections, to adapt parameter updates. A second raw moment of gradients is not a second derivative or a Hessian. Adam can work well in practice, but neither faster convergence nor convergence on every problem is guaranteed.');
  q('m7-7-4-q5').question = '<p>How does Adam adapt its parameter updates?</p>';
  correctOption('m7-7-4-q5', 'It tracks moving averages of gradients and squared gradients');
  q('m7-7-4-q5').explanation = 'Adam uses first and second raw gradient moments with bias corrections. Squared gradients are not Hessian curvature, and faster convergence than basic gradient descent is not unconditional.';
  done(10, 'Separated Adam gradient moments from Newton curvature and removed speed guarantee.', 'Consistent with Adam’s first-order moment update definitions (Kingma and Ba, arXiv:1412.6980).');

  html('m10-4-t1', 'A function on a convex domain is <strong>convex</strong> if the line segment joining any two points on its graph lies on or above the graph. Every local minimum is global, but a minimum need not be unique or even attained. Gradient-descent convergence requires additional assumptions, such as a minimiser that exists, a smooth convex objective, and a suitable step size. For f(x)=x², the update is xₜ₊₁=(1−2α)xₜ: 0&lt;α&lt;1 converges to 0, α=1 oscillates from a nonzero start, and α&gt;1 diverges in magnitude. Neural-network objectives are generally non-convex.');
  b('m10-3-ex1').promptHtml = 'Run gradient descent on f(x)=x² from x=5 with learning rates 0.01, 1.0 and 1.1. Which converges, which oscillates without growing, and which diverges in magnitude? Derive the update multiplier 1−2α and the convergent interval for α.';
  q('m10-10-4-q1').question = '<p>Which property holds for a convex function on a convex domain?</p>';
  correctOption('m10-10-4-q1', 'Every local minimum is global, if such a minimum exists');
  q('m10-10-4-q1').explanation = 'Convexity rules out nonglobal local minima. It does not ensure a unique or attained minimum, or gradient-descent convergence without suitable step sizes and other assumptions.';
  illustration('m10-4-ill1', 'Examples, not universal shapes: x² is convex with a unique minimum; x⁴−2x² is non-convex with two local minima and a local maximum. Convex objectives may also have several minimisers or no attained minimum. Convergence depends on the update rule and its assumptions.', svg('Convex and non-convex examples', label(210,30,'Convex example: x²') + axes(50,55,320,145) + curve((x)=>x*x,-1.5,1.5,50,55,320,145,0,2.5) + label(630,30,'Non-convex: x⁴ − 2x²') + axes(470,55,320,145) + curve((x)=>x**4-2*x*x,-1.5,1.5,470,55,320,145,-1.2,1) + label(420,242,'Convexity alone does not guarantee convergence.',17)));
  done(11, 'Qualified convergence, corrected oscillation exercise and replaced overclaiming diagram.', 'Update multipliers 0.98, −1 and −1.2 distinguish convergence, oscillation and divergence.');
  b('m10-1-code1').code = b('m10-1-code1').code.replace('two minima and a saddle point', 'two local minima and a local maximum');
  done(12, 'Corrected the 1D maximum label.', 'f″(0)=−4; f″(±1)=8.');

  const pvalue = 'The probability, under H₀ and the test’s assumptions, of a test statistic at least as extreme as the observed value, using the preselected one- or two-sided alternative. It is not the probability that H₀ is true and is not the likelihood of the particular observed dataset.';
  b('m14-3-def2').definitionHtml = pvalue;
  correctOption('m14-14-3-q1', 'Probability under H₀ of a test statistic at least as extreme as observed');
  q('m14-14-3-q1').explanation = pvalue;
  done(13, 'Removed likelihood shorthand in definition and quiz.', 'Tail event and null-model assumptions are explicit.');

  html('m14-3-t5', 'Comparing model accuracies requires an inference procedure matched to the data. Cross-validation folds have overlapping training data, so their scores are correlated: an ordinary paired t-test on fold scores need not be calibrated. Use a justified corrected repeated-CV procedure or an appropriately designed independent evaluation. For a beginner paired t-test, use before/after measurements on independent subjects and analyse the within-subject differences. Multiple testing may require family-wise or false-discovery-rate control.');
  q('m14-14-3-q5').explanation = 'A paired t-test analyses within-subject differences. Different subjects’ differences must be independent, with appropriate distributional assumptions. Overlapping cross-validation folds do not automatically satisfy independence.';
  html('m14-4-t5', 'Confidence intervals quantify uncertainty under an explicit sampling model. Cross-validation gives several scores, but overlapping training folds make them correlated; the naïve fold standard error is not generally a calibrated CI. Overlap of two individual CIs is not a significance test for their difference. Compare a paired difference with a procedure justified by the design. For genuinely independent normally distributed measurements with unknown variance, use a t interval for their population mean. Prediction intervals concern new observations and include their additional variability.');
  q('m14-14-4-q5').question = '<p>Why must uncertainty estimates from cross-validation folds account for the evaluation design?</p>';
  correctOption('m14-14-4-q5', 'Overlapping training data make fold scores correlated');
  q('m14-14-4-q5').explanation = 'Treating correlated fold scores as independent can underestimate uncertainty. A valid interval needs justified assumptions or a correction; individual CI overlap is not a test of a paired difference.';
  b('m14-4-ex1').promptHtml = 'Five independent normally distributed laboratory measurements are [91.2, 92.1, 90.5, 91.8, 93.0] units. Estimate the population mean with a 95% t confidence interval, using sample standard deviation (denominator n−1), SE=s/√5 and t₀.₉₇₅,₄≈2.776. Does this two-sided interval contain 90? These are independent measurements, not cross-validation fold scores.';
  done(14, 'Replaced naïve CV inference with design-aware guidance and an independent-measurement t interval exercise.', 'Exercise mean 91.72; 95% t interval approximately [90.551,92.889].');

  b('m15-1-ex1').promptHtml = b('m15-1-ex1').promptHtml.replace('[0.7, 0.2, 0.1]', '[0.62, 0.23, 0.15]') + ' First verify that the weighted child class proportions equal the parent proportions.';
  b('m15-4-code1').code = b('m15-4-code1').code.replace('entropy_bits([0.5, 0.5])  # 50-50 split', 'entropy_bits([0.62, 0.38])  # 0.6*[0.9,0.1] + 0.4*[0.2,0.8]');
  done(15, 'Reconciled each parent distribution with its weighted children.', 'Three-class parent [0.62,0.23,0.15]; binary parent [0.62,0.38]; nonnegative recomputed information gains.');

  html('m16-4-t3', 'A <strong>random walk</strong> moves between neighbouring states at random. For a symmetric ±1 walk Sₙ starting at 0, E[Sₙ]=0, the root-mean-square displacement √E[Sₙ²]=√n, and the mean absolute displacement E|Sₙ| is asymptotic to √(2n/π), not equal to √n. These are ensemble averages, not the prediction for a single path. On a finite connected undirected graph with at least one edge, degree-proportional probabilities form a stationary distribution. Convergence to it from an arbitrary starting node additionally needs aperiodicity, obtainable by a lazy walk that sometimes stays put. The ordinary two-node alternating walk is stationary when started in its stationary mixture, but does not converge from one endpoint.');
  q('m16-16-4-q3').question = '<p>For a symmetric ±1 random walk from 0, what is the root-mean-square displacement after n steps?</p>';
  q('m16-16-4-q3').explanation = 'Independent zero-mean unit steps give E[Sₙ²]=n, so RMS displacement is √n. Mean absolute displacement is instead asymptotic to √(2n/π).';
  b('m16-4-code1').code = b('m16-4-code1').code.replace('print(f"Expected |position| ≈ √n = {np.sqrt(1000):.1f}, actual = {abs(positions[-1])}")', 'print(f"RMS displacement = √n = {np.sqrt(1000):.1f}")\nprint(f"Mean |position| asymptotically ≈ √(2n/π) = {np.sqrt(2*1000/np.pi):.1f}")\nprint(f"This one path has |position| = {abs(positions[-1])}")');
  done(16, 'Distinguished signed mean, RMS and mean absolute displacement in prose, quiz and output.', 'At n=1000 RMS≈31.6228; asymptotic mean absolute displacement≈25.2313 (exact≈25.2250).');

  b('m4-1-tab1').rows[1][0] = 'Weight matrix W in row-batch Y = XW';
  q('m4-4-1-q4').question = '<p>Using row-batch Y = XW, with samples in rows of X, W has shape (256, 128). How many input features are there?</p>';
  q('m4-4-1-q4').explanation = 'For X with shape (batch, inputs), W has shape (inputs, outputs). Thus W=(256,128) means 256 inputs and 128 outputs. Other conventions transpose W.';
  q('m4-4-4-q5').question = '<p>With column-vector input x, a layer computes activation(W_col x + b), where W_col = W_rowᵀ from the row-batch convention. The W_col x operation is:</p>';
  q('m4-4-4-q5').explanation = 'Matrix multiplication. For a column input, W_col has shape (outputs, inputs). This is the transpose of W_row used in XW_row for samples stored in rows.';
  done(17, 'Made both orientation conventions explicit and connected them by transpose.', '(batch,256)@(256,128) yields (batch,128); (128,256)@(256,) yields (128,).');

  html('m6-3-t1', 'For any real m×n matrix, the <strong>Singular Value Decomposition</strong> factors A = UΣVᵀ. In the full SVD, U and V are square orthogonal matrices: their coordinate changes may rotate and/or reflect. The rectangular m×n diagonal matrix Σ contains nonnegative singular values; it scales coordinates and, when m≠n, changes dimension. SVD reveals useful structure even for nonsquare matrices.');
  illustration('m6-3-ill1', 'For a real m×n matrix, A=UΣVᵀ: orthogonal coordinate changes (rotations and/or reflections), nonnegative scaling and possible dimension change. Full SVD shapes: Vᵀ is n×n, Σ is m×n, U is m×m.', svg('Real-matrix full singular value decomposition', label(420,35,'A = UΣVᵀ     (operations act from right to left)',22) + [
    [135,'Vᵀ: ℝⁿ → ℝⁿ','Rotate and/or reflect'],[420,'Σ: ℝⁿ → ℝᵐ','Scale; possible dimension change'],[705,'U: ℝᵐ → ℝᵐ','Rotate and/or reflect'],
  ].map(([x,title,foot])=>`<rect x="${x-125}" y="75" width="250" height="90" rx="8" fill="#f4f4f2" stroke="#995600"/>`+label(x,110,title,19)+label(x,145,foot,14)).join('') + label(277,125,'→',24)+label(562,125,'→',24)+label(420,225,'Orthogonal factors preserve lengths; Σ contains the singular values.')));
  done(18, 'Replaced rotation-only prose, caption and diagram with real full-SVD dimensions and reflection allowance.', 'Matrix shapes multiply to m×n; operations shown in application order Vᵀ,Σ,U.');

  html('m6-4-t3', 'A <strong>scree plot</strong> shows each component’s eigenvalue or individual explained-variance ratio. A <strong>cumulative explained-variance plot</strong> sums those ratios across the retained components. An elbow or a chosen cumulative threshold such as 90–95% is a heuristic, not a guaranteed optimal dimension. Validate the retained components against the downstream task: preserving variance does not necessarily preserve the information most useful for prediction.');
  q('m6-6-4-q2').explanation = 'A scree plot shows individual eigenvalues or explained-variance ratios. Its elbow can suggest a component count. A cumulative plot instead sums the ratios; either choice should be validated for the task.';
  done(19, 'Separated scree and cumulative plots and qualified dimension-selection heuristics.', 'Individual versus cumulative variance are distinct quantities.');

  const clt = 'For independent identically distributed observations with finite mean μ and finite nonzero variance σ², √n (X̄−μ)/σ converges in distribution to a standard normal. At sufficiently large n this can justify a normal approximation for the sampling distribution of the mean; the population itself does not become normal. Heavy tails can make convergence slow, and the ordinary finite-variance CLT does not apply to Cauchy data.';
  html('m14-2-t4', clt);
  b('m14-2-def4').definitionHtml = clt + ' The standard error of the iid sample mean is σ/√n.';
  correctOption('m12-12-3-q4', 'Standardized sample means approach a normal distribution under iid finite-variance assumptions');
  q('m12-12-3-q4').explanation = clt;
  illustration('m14-2-ill1', 'CLT for iid Uniform(0,1) observations. The original population stays uniform; the sample mean is approximately normal for large n with mean 0.5 and standard deviation 1/√(12n). Curves for n=30 and n=100 are normal approximations, not exact finite-sample densities.', svg('Population and normal approximations to sample means', label(140,30,'Population: Uniform(0,1)')+axes(30,55,220,150)+`<path d="M30 80H250" stroke="#995600" stroke-width="3"/>`+label(140,235,'Mean 0.5; variance 1/12',14)+[30,100].map((n,i)=>{const x=310+i*280;const sd=1/Math.sqrt(12*n);return label(x+110,30,`Sample mean, n=${n}`)+axes(x,55,220,150)+curve((v)=>Math.exp(-0.5*((v-.5)/sd)**2)/(sd*Math.sqrt(2*Math.PI)),0,1,x,55,220,150,0,15)+label(x+110,235,'Normal approximation',14);}).join('')+label(420,265,'x: 0–1 in all panels. Density scales: 0–1.2 (left), 0–15 (middle/right).',13)));
  for (const collection of [bank,legacy]) {
    const item = collection.find((x)=>x.id==='exam-q27');
    if (!item) throw new Error('Missing mathematics private exam-q27');
    item.question = 'For iid observations with finite nonzero variance, standardized sample means converge in distribution to a _____ distribution as sample size grows:';
    item.explanation = clt;
  }
  done(20, 'Qualified the CLT in the adjacent prose/definition, quiz, original scientific illustration and both adapted private-bank copies.', 'Uniform mean variance 1/(12n); standardization and finite nonzero variance conditions explicit.');
  for (const collection of [bank,legacy]) {
    const item = collection.find((x)=>x.id==='exam-q2');
    item.question = 'In linear-algebra terminology, f(x) = 3x + 7 is:';
    item.options.find((o)=>o.id==='C').text = 'Affine, with a straight-line graph';
    item.explanation = 'It is affine: f(x)=Ax+b with b=7. It is not a linear map because f(0)=7 rather than 0. Elementary graphing texts sometimes call such straight-line functions linear.';
  }
  done(21, 'Changed adapted private-bank terminology to affine, retaining question/answer IDs and preserving original files.', 'f(0)=7≠0 disproves linear-map identity.');

  b('m16-2-code1').code = b('m16-2-code1').code.replace('# Create a signal:', 'rng = np.random.default_rng(42)\n\n# Create a signal:').replace('np.random.randn(len(t))','rng.standard_normal(len(t))').replace('# Top 3 frequencies by power','# Top 2 frequencies by power: the two planted sinusoids').replace('[-3:]','[-2:]');
  const timePath=curve((t)=>Math.sin(2*Math.PI*100*t)+.5*Math.sin(2*Math.PI*250*t),0,.04,55,55,730,85,-1.6,1.6);
  illustration('m16-2-ill1', 'Two planted frequencies: 100 Hz and 250 Hz, sampled at 1000 Hz. Top: the clean signal sin(2π100t)+0.5sin(2π250t) over 0–0.04 seconds, shown without noise for clarity. Bottom: ideal one-sided amplitude lines at 100 Hz (1) and 250 Hz (0.5). The code adds seeded noise and reports the two largest power-spectrum peaks. Amplitude and power have different scales.', svg('Two-frequency signal and ideal amplitude spectrum', label(420,27,'Clean two-tone time signal (0–0.04 s)')+axes(55,55,730,85)+timePath+label(420,169,'Ideal one-sided amplitude spectrum')+axes(55,185,730,75)+`<path d="M201 260V190 M420 260V225" stroke="#995600" stroke-width="4"/>`+label(201,285,'100 Hz; amplitude 1',14)+label(420,285,'250 Hz; amplitude 0.5',14)+label(785,285,'500 Hz',14),310));
  done(22, 'Aligned the two-tone caption, computed waveform, spectrum and code; seeded noise and report top two peaks.', 'Signals remain below Nyquist; FFT peaks checked at exactly 100 and 250 Hz.');

  b('m14-2-ex1').promptHtml = 'Generate 500 bootstrap samples with replacement, each of size 8, from [10, 12, 15, 20, 25, 30, 35, 40]. Compute each sample mean and estimate its bootstrap standard error using the standard deviation of the 500 means. Compare this with s/√8, where s is the sample standard deviation with denominator 7. These estimates need not agree exactly: the ordinary bootstrap uses the empirical distribution (variance denominator 8) and finite simulation also adds variation.';
  done(23, 'Restored ordinary bootstrap resample size to original n=8 and clarified finite-sample comparison.', 'Empirical-distribution bootstrap mean variance = sample population variance / 8.');
  q('m13-13-2-q5').question = '<p>With suitable model/data conditions and prior support near the true parameter, collecting more data typically means the posterior:</p>';
  correctOption('m13-13-2-q5', 'Is increasingly informed by the likelihood rather than the initial prior');
  q('m13-13-2-q5').explanation = 'More informative data often reduces prior influence. Concentration near truth additionally needs an appropriate identifiable model, suitable sampling conditions and prior support near truth. Zero prior support cannot be repaired by multiplying by a likelihood; consistency is not unconditional.';
  done(24, 'Qualified posterior concentration and made zero-support limitation explicit.', 'Bayes multiplication preserves zero prior mass/support on excluded hypotheses.');
  b('m16-4-def3').definitionHtml = 'A sequence of random steps on a graph or lattice. For the ordinary walk on a finite connected undirected graph with at least one edge, move to a uniformly random neighbour; π(i)=degree(i)/(2|E|) is stationary. Stationarity (πP=π) does not alone guarantee convergence from every start. Aperiodicity, for example by staying put with probability 1/2, ensures convergence in this setting.';
  q('m16-16-4-q2').explanation = 'For a row-vector distribution and row-stochastic P, stationarity means πP=π: starting at π keeps the distribution unchanged. Convergence from other starts needs additional conditions; a finite irreducible aperiodic chain converges to its unique stationary distribution.';
  done(25, 'Separated stationarity from convergence in definition, shared random-walk paragraph and quiz.', 'The two-state alternating matrix has invariant [1/2,1/2] but alternates from [1,0]; laziness removes the period.');

  const lesson = content.modules.flatMap((m)=>Object.values(m.lessonContent)).find((l)=>l.blocks.some((x)=>x.id==='m9-3-t2'));
  if (lesson.blocks.some((x)=>x.id==='m9-3-ill-substitution-armature-r1')) throw new Error('Mathematics corrections already applied');
  lesson.blocks.splice(lesson.blocks.findIndex((x)=>x.id==='m9-3-t2')+1,0,{id:'m9-3-ill-substitution-armature-r1',type:'illustration',content:{caption:'Original substitution diagram: u=x² and du=2x dx turn ∫2x e^(x²) dx into ∫eᵘ du. Integrate in u, then substitute x² back. Differentiating e^(x²)+C returns the original integrand.',svgCode:svg('Integration by substitution: forward transformation and back substitution',label(420,30,'Substitution reverses the chain rule',22)+[ [180,90,'∫ 2x e^(x²) dx'],[660,90,'∫ eᵘ du'],[660,210,'eᵘ + C'],[180,210,'e^(x²) + C']].map(([x,y,t])=>`<rect x="${x-145}" y="${y-32}" width="290" height="58" fill="#f4f4f2" stroke="#995600" rx="6"/>`+label(x,y+5,t,24)).join('')+label(420,83,'u=x², du=2x dx',17)+label(420,110,'→',24)+label(745,157,'integrate',15)+label(660,159,'↓',24)+label(420,205,'substitute back',17)+label(420,231,'←',24)+label(420,273,'Check: d/dx [e^(x²) + C] = 2x e^(x²)',17),300)}});
  done(26, 'Added an original inline SVG directly after the substitution paragraph. No omitted source illustration was present in the preserved lesson; new ID explicitly marks this adaptation.', 'Forward substitution and derivative check agree; existing block order and IDs preserved.');
  return findings;
}
