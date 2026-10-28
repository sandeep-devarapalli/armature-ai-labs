import assert from 'node:assert/strict';

const svg = (title, body, height = 400) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ${height}" role="img" aria-label="${title}"><rect width="720" height="${height}" fill="#fff"/><g font-family="sans-serif" font-size="18" fill="#171817" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const hbridge = svg('H-bridge: opposite diagonal pairs drive the motor', `
<text x="360" y="30" text-anchor="middle" font-weight="bold">H-bridge: switch positions and current paths</text>
<g fill="none" stroke="#171817" stroke-width="3"><path d="M210 60H510 M240 60V95 M480 60V95 M240 145V235 M480 145V235 M240 285V320H480V285 M240 190H320 M400 190H480"/><circle cx="360" cy="190" r="40"/>
<rect x="220" y="95" width="40" height="50"/><rect x="460" y="95" width="40" height="50"/><rect x="220" y="235" width="40" height="50"/><rect x="460" y="235" width="40" height="50"/>
<path d="M360 320V337 M340 337H380 M347 344H373 M354 351H366"/></g>
<text x="360" y="53" text-anchor="middle">V+</text><text x="360" y="197" text-anchor="middle">M</text><text x="188" y="128">S1</text><text x="515" y="128">S2</text><text x="188" y="266">S3</text><text x="515" y="266">S4</text>
<text x="277" y="183">A</text><text x="429" y="183">B</text>
<g fill="none" stroke-width="4"><path stroke="#ad5100" d="M225 75V174H495V310 M415 166L427 174L415 182"/><path stroke="#326a96" d="M495 75V206H225V310 M305 198L293 206L305 214"/></g>
<text x="20" y="382" fill="#ad5100">Forward: V+ → S1 → A → M → B → S4 → GND</text>
<text x="20" y="412" fill="#326a96">Reverse: V+ → S2 → B → M → A → S3 → GND</text>
<text x="20" y="450">Brake: S1 + S2 or S3 + S4; coast: all open.</text>
<text x="20" y="480">Never close S1 + S3 or S2 + S4 (supply short).</text>
<text x="20" y="518" font-size="16">Conceptual switch topology; driver protection and flyback paths omitted.</text>`, 540);
const lineFollower = svg('Line left: slow left wheel and speed up right wheel', `
<text x="360" y="30" text-anchor="middle" font-weight="bold">Line following: top-down steering convention</text>
<path d="M290 45V385" stroke="#767672" stroke-width="18"/>
<rect x="170" y="155" width="380" height="195" rx="20" fill="#f2eee4" stroke="#171817" stroke-width="2"/>
<rect x="145" y="215" width="45" height="90" fill="#171817"/><rect x="530" y="215" width="45" height="90" fill="#171817"/>
<path d="M170 201V170 M160 180L170 170L180 180 M550 201V115 M540 125L550 115L560 125" fill="none" stroke="#ad5100" stroke-width="4"/>
<text x="110" y="335" text-anchor="middle">Left slower</text><text x="625" y="335" text-anchor="middle">Right faster</text>
<g stroke="#171817" stroke-width="2"><circle cx="230" cy="155" r="17" fill="#fff"/><circle cx="295" cy="155" r="17" fill="#ad5100"/><circle cx="360" cy="155" r="17" fill="#fff"/><circle cx="425" cy="155" r="17" fill="#fff"/><circle cx="490" cy="155" r="17" fill="#fff"/></g>
<text x="230" y="127" text-anchor="middle">0</text><text x="295" y="127" text-anchor="middle">1</text><text x="360" y="127" text-anchor="middle">2</text><text x="425" y="127" text-anchor="middle">3</text><text x="490" y="127" text-anchor="middle">4</text>
<text x="360" y="240" text-anchor="middle">Front ↑</text><text x="360" y="276" text-anchor="middle">Sensors: left 0 → right 4</text>
<text x="20" y="425">Position 1000: error = 2000 − 1000 = +1000</text>
<text x="20" y="458">Positive P correction: left = base − correction;</text><text x="20" y="488">right = base + correction → steer left toward the line.</text>
<text x="20" y="525" font-size="16">Conceptual orientation; confirm sensor polarity and wheel direction on the robot.</text>`, 550);
const sensorDiagram = svg('Sensor interfaces are device-specific', `
<text x="360" y="35" text-anchor="middle" font-weight="bold">Typical sensor interfaces</text>
${[['MPU-6050 IMU','I²C',90],['HC-SR04 distance','GPIO trigger / timed echo',145],['TCRT5000 proximity','Analog or digital module output',200],['NTC thermistor','Divider → ADC input',255],['DS18B20 temperature','1-Wire digital bus',310]].map(([a,b,y]) => `<rect x="20" y="${y-30}" width="270" height="42" fill="#f2eee4" stroke="#767672"/><text x="35" y="${y-3}">${a}</text><path d="M295 ${y-10}H330" stroke="#171817" stroke-width="2"/><text x="345" y="${y-3}" font-size="17">${b}</text>`).join('')}
<text x="20" y="370" font-size="16">Check voltage levels, pull-ups and the exact module schematic before wiring.</text>`);

export function correctEmbedded({ content, bank, legacy }) {
  const blocks = content.modules.flatMap(m => Object.values(m.lessonContent).flatMap(l => l.blocks));
  const get = id => { const b = blocks.find(b => b.id === id); assert(b, `Missing embedded block ${id}`); return b.content; };
  const replace = (id, field, from, to) => { assert(get(id)[field].includes(from), `Missing correction anchor ${id}: ${from}`); get(id)[field] = get(id)[field].replace(from, to); };
  const q = (id, question) => { const found = get(id).questions.find(q => q.id === question); assert(found); return found; };
  const option = (question, id, text) => { const o = question.options.find(o => o.id === id); assert(o); o.text = text; };
  const illustration = (id, svgCode, caption) => { const c = get(id); delete c.name; c.svgCode = svgCode; c.caption = caption; };
  const findings = [];
  const done = (id, notes, verification, status = 'corrected') => findings.push({ id, status, notes, verification });

  replace('m17-4-code1', 'code', 'BASE_SPEED + (int)correction', 'BASE_SPEED - (int)correction');
  replace('m17-4-code1', 'code', 'BASE_SPEED - (int)correction;\n    motor_set_left', 'BASE_SPEED + (int)correction;\n    motor_set_left');
  get('m17-4-t4').html = '<p>The PID function uses error = setpoint − actual. With P control alone, a centred line (position 2000) gives zero correction. A line to the left gives positive error: subtract the correction from the left wheel command and add it to the right, steering left. A line to the right does the opposite. Integral history and the derivative term can produce a nonzero correction even when the current error is zero. Gains require tuning; the example values are not calibrated for a particular robot. Confirm sensor polarity, wheel direction and lost-line handling at limited speed before an executable exercise.</p>';
  done('EF-01', 'Corrected differential steering signs and distinguished P response from PID state.', 'Host tests cover centre, left and right P-only cases. Hardware orientation remains unverified.');

  replace('m16-4-code2', 'code', 'float adjustment = KP * error;\n    duty_cycle += adjustment;', 'float duty_cycle = KP * error;  // No accumulated error in P-only control');
  get('m16-4-t7').html = '<p>Proportional feedback can reduce the effect of load and supply changes, but its performance depends on the motor, gain and sampling. With this zero-bias P-only controller, zero error commands zero duty; a nonzero steady-state error is usually needed to sustain motion. Excessive gain can cause oscillation. Integral action can reduce steady-state error, while derivative action may improve damping; neither guarantees smooth or accurate control without tuning, saturation handling and testing.</p>';
  done('EF-02', 'Removed the accidental error accumulator from the P-only example.', 'Repeated constant-error host tests yield equal commands, including zero-error and clamp cases.');

  get('m16-4-code1').code = `// Conceptual STM32 16-bit encoder-counter example; configure pins/clocks/filtering separately.
// Encoder mode 3 counts both edges of both channels (x4).
TIM2->SMCR = 3;
TIM2->CCMR1 = (1 << 0) | (1 << 8);
TIM2->CCER = 0;
TIM2->ARR = 0xFFFF;
TIM2->CNT = 0;
TIM2->CR1 |= TIM_CR1_CEN;

// Initialise previous_count from CNT before the first timed sample.
// CPR means counts per mechanical revolution AFTER x4 decoding.
// Fewer than 32768 counts may pass in either direction per sample.
bool encoder_rpm(uint16_t current, uint16_t previous,
                 uint32_t interval_ms, uint32_t cpr, float *rpm) {
    if (interval_ms == 0 || cpr == 0 || rpm == NULL) return false;
    uint16_t wrapped = (uint16_t)(current - previous);
    int32_t delta = wrapped < 32768u ? (int32_t)wrapped : (int32_t)wrapped - 65536;
    *rpm = (float)delta * 60000.0f / ((float)interval_ms * (float)cpr);
    return true;
}
// Update previous_count only at the sampling boundary after a valid interval.
// Example: 100 counts / 100 ms with 400 decoded CPR = 150 RPM.`;
  done('EF-03', 'Used modulo-65536 counter subtraction and explicit decoded-CPR and sampling assumptions.', 'Compiled host checks cover signed boundary, both wrap directions, reverse motion, invalid interval/CPR and 400-CPR calculation.');

  get('m16-2-t5').html = '<p>A spinning motor produces <strong>back-EMF</strong> opposing the applied voltage. Separately, changing current through the winding inductance produces switching transients. A suitable recirculation path controls these transients. The L298 requires external fast flyback diodes for inductive loads: inspect the actual module schematic to confirm they are fitted and correctly rated. Other drivers and discrete MOSFET circuits have different recirculation arrangements; never assume protection from a generic driver name.</p><p>Before a hardware exercise, check the driver supply, thermal and current limits against the motor stall and braking currents. Use a secured, unloaded mechanism, a current-limited supply and an accessible means of removing motor power. Ramp down and confirm standstill before reversing unless a reviewed current-controlled design permits reversal. A firmware braking command is not an independently reliable emergency stop.</p>';
  get('m16-2-def2').definitionHtml = 'The voltage generated by a rotating motor that opposes the applied drive voltage and varies with speed. Distinguish this from the winding-inductance transient caused by changing current. Recirculation paths and current limits must be designed for the selected motor and driver.';
  replace('m16-2-t3','html','integrates all four switches, shoot-through protection, and sometimes current sensing','integrates all four switches and may provide protection or current sensing, depending on the device');
  replace('m16-2-t2','html','Good H-bridge driver ICs include <strong>shoot-through protection</strong> hardware that prevents this configuration, but your firmware should also enforce it as an additional safety layer.','Check the selected driver\'s protection, dead-time and input-transition requirements. A generic driver label does not establish shoot-through protection.');
  get('m16-2-tab1').rows[2] = ['Commanded brake', 'S1 + S2 ON (or S3 + S4)', 'Terminals shorted; braking current must stay within ratings', 'Controlled deceleration, not a static holding guarantee'];
  get('m16-2-code1').code = `// Conceptual L298 motor command; configure PWM mode 1, active-high output separately.
// Only change direction at verified standstill with driver current limits checked.
// These board-specific helpers must implement safe ENA disable and pin transitions.
typedef enum { MOTOR_FORWARD, MOTOR_REVERSE, MOTOR_BRAKE, MOTOR_COAST } MotorDir;

bool motor_set(MotorDir dir, uint8_t speed_percent) {
    if (dir < MOTOR_FORWARD || dir > MOTOR_COAST) return false;
    if (speed_percent > 100) speed_percent = 100;
    // This example uses a 16-bit timer and reserves one representable CCR value
    // above ARR, so 100% has CCR = ARR + 1. ARR = 65535 is rejected.
    uint32_t period_ticks = (uint32_t)TIM3->ARR + 1u;
    if (period_ticks > 65535u) return false;
    disable_ena_and_wait_for_output_low();  // Target-specific, not implemented here
    switch (dir) {
        case MOTOR_FORWARD: gpio_write(IN1_PIN, 1); gpio_write(IN2_PIN, 0); break;
        case MOTOR_REVERSE: gpio_write(IN1_PIN, 0); gpio_write(IN2_PIN, 1); break;
        case MOTOR_BRAKE:
            gpio_write(IN1_PIN, 1); gpio_write(IN2_PIN, 1);
            speed_percent = 100;  // Commanded brake; check braking-current rating
            break;
        case MOTOR_COAST:
            gpio_write(IN1_PIN, 0); gpio_write(IN2_PIN, 0);
            speed_percent = 0;
            break;
    }
    TIM3->CCR1 = (uint16_t)((uint32_t)speed_percent * period_ticks / 100u);
    enable_ena_pwm_with_preload_synchronization();  // Target-specific
    return true;
}
// Handle false at the caller without enabling the motor.
// Separate examples, NOT a live forward/reverse sequence:
// motor_set(MOTOR_FORWARD, 70);
// After ramp-down and verified standstill: motor_set(MOTOR_REVERSE, 50);
// motor_set(MOTOR_BRAKE, 0); // Commanded braking, not an emergency-stop system.`;
  replace('m16-2-ex1','promptHtml','emergency stop.','commanded braking. Include current limits, a standstill-before-reversal procedure and independent motor-power removal in the design; do not energise an unreviewed circuit.');
  replace('m16-2-ex1','placeholder','Emergency stop: robot_drive(0, 0) with brake mode','Commanded braking: use a separate robot_brake() command with rated braking current. Define robot_drive(0, 0) explicitly as coast or brake; zero speed alone does not specify the bridge state.');
  option(q('m16-2-quiz1','q5'),'A','The voltage generated by a rotating motor that opposes its applied drive voltage; winding-current switching transients are a separate design concern');
  q('m16-2-quiz1','q5').explanation = 'Back-EMF is generated by rotation. Interrupting winding current creates an inductive transient; provide the recirculation path required by the selected driver. L298 inductive-load circuits require external fast diodes, which may already be fitted on a module.';
  q('m16-2-quiz1','q3').explanation = 'PWM duty changes the effective motor drive. Speed also depends on load, supply and motor characteristics; 50% duty does not guarantee 50% speed.';
  done('EF-04', 'Corrected motor transient/protection explanations and removed emergency-stop claims from the conceptual command and exercise.', 'L298 datasheet checked. Electrical, thermal and hardware checks remain required for a chosen board.');

  get('m13-4-code1').code = `// NON-EXECUTABLE PSEUDOCODE: classic Cortex-M exception frames.
// A target/toolchain-specific assembly entry wrapper must run BEFORE a C prologue:
exc_return = LR_on_exception_entry
raw_sp = (exc_return bit 2 is set) ? PSP : MSP
branch_to_capture(raw_sp, exc_return)

capture(raw_sp, exc_return):
    save fault status registers and exc_return in reserved crash storage
    if stacking/unstacking/lazy-FP faults or raw_sp outside valid stack memory:
        record "stack frame unavailable"; do not dereference raw_sp
    else:
        // On classic Cortex-M FP frames, bit 4 clear means 18 FP words
        // precede the eight core-register words. Confirm the target architecture.
        core_frame = raw_sp + ((exc_return bit 4 is clear) ? 18 words : 0 words)
        verify the entire core frame is readable in the selected stack region
        capture R0, R1, R2, R3, R12, LR, PC, xPSR from core_frame[0..7]
        // xPSR stack-alignment padding matters when reconstructing pre-exception SP.
    record BFAR/MMFAR only when their validity flags are set
    use a fault-safe preallocated storage path; do not call ordinary Flash drivers
    reset or halt using the target's reviewed recovery path

// Validate MSP and PSP faults, stacked PC, FPU/lazy stacking and invalid stacks
// on the selected core. Cortex-M variants/security extensions need their own decoder.`;
  get('m13-4-code1').language = 'text';
  done('EF-05', 'Replaced misleading executable-looking handler with explicit frame-aware pseudocode.', 'MSP/PSP selection, extended-frame offset and stacking-fault rejection reviewed; no target compilation or fault injection claimed.');
  replace('m8-2-code1','code','--gc-sections','-Wl,--gc-sections');
  done('EF-06','Forwarded the linker option through GCC correctly.','GCC Link Options documentation checked; complete target build remains deferred.');

  replace('m4-4-t8','html','CCR / ARR × 100%','CCR / (ARR + 1) × 100%');
  get('m4-4-t8').html += '<p>This formula describes edge-aligned, up-counting, active-high PWM mode 1: the counter visits 0 through ARR. CCR = 0 gives 0%; CCR = ARR + 1 gives 100% only if that compare value is representable. Otherwise select a documented forced-output/full-scale method. Other PWM modes or output polarities need their own formula.</p>';
  q('m4-4-quiz1','q3').question = 'For edge-aligned, up-counting, active-high PWM mode 1, what determines duty cycle?';
  option(q('m4-4-quiz1','q3'),'B','CCR / (ARR + 1), because the counter includes both 0 and ARR');
  q('m4-4-quiz1','q3').explanation = 'The period contains ARR + 1 timer ticks. For ARR = 9 and CCR = 5, 5 of the 10 ticks are high: 50%. Full-scale compare handling depends on timer width and mode.';
  done('EF-07','Aligned PWM formula, quiz and motor conversion with inclusive timer counting.','Host checks cover ARR=9 with 0%, 50%, 100%, and rejection of an unrepresentable full-scale compare.');
  replace('m15-3-code2','code','// Averaging 16 samples reduces noise by a factor of √16 = 4\n// Effectively adds ~2 bits of resolution (12-bit → ~14-bit effective)','// For independent zero-mean noise and a stationary input, averaging can reduce\n// noise standard deviation by sqrt(16)=4. Correlated noise may improve less.\n// Integer averaging still returns 0..4095 for a 12-bit ADC; no extra code bits\n// are retained. Extra resolution requires appropriate oversampling/decimation.');
  done('EF-08','Removed the 14-bit output claim from integer averaging.','Output-range check confirms 0..4095; noise improvement is conditional, not measured.');
  get('m12-2-l2').items = [
    '<strong>Build time</strong> — Use a digital-signature algorithm to sign the firmware message or its digest, following that algorithm\'s API. The private signing key produces a signature; ECDSA is one example. This is not encryption for confidentiality.',
    '<strong>Boot time</strong> — The bootloader uses a trusted public key and the same algorithm to verify the signature against the firmware message/digest. Verification reports success or failure; it does not decrypt an ECDSA signature into a hash.',
    '<strong>Decision</strong> — Continue only when signature verification and the other configured boot checks succeed. Verification establishes integrity and origin relative to the trusted key, not freedom from software defects.'
  ];
  done('EF-09','Replaced private-key encryption language with algorithm-neutral sign/verify.','Revised steps distinguish authentication from confidentiality.');
  get('m10-3-t1').html = '<p>A small RTOS kernel focuses on scheduling and synchronisation. Complete RTOS distributions and libraries can also provide networking, filesystems, USB and graphics: Zephyr is one example. Embedded Linux is useful when a device needs its process model, broad driver/application ecosystem and richer userspace on suitable hardware. A network or filesystem alone does not require Linux. Choose against application requirements and measured resource/timing constraints.</p>';
  q('m10-3-quiz1','q1').question = 'Why might a project choose embedded Linux over a small RTOS kernel?';
  option(q('m10-3-quiz1','q1'),'B','Its process model, broad driver and application ecosystem, and rich userspace on suitable hardware');
  q('m10-3-quiz1','q1').explanation = 'Linux offers a broad userspace and process model. RTOS distributions such as Zephyr can also provide networking, filesystems and USB; these services are not exclusive to Linux.';
  done('EF-10','Distinguished a scheduling kernel, RTOS distributions and Linux.','Zephyr Services documentation checked alongside revised question.');
  illustration('m15-2-ill1', sensorDiagram, 'Typical interfaces: MPU-6050 uses I²C; HC-SR04 uses trigger and echo timing; TCRT5000 module outputs vary; an NTC divider feeds an ADC; DS18B20 uses 1-Wire. These are interface categories, not a wiring schematic.');
  done('EF-11','Corrected DS18B20 to 1-Wire and separated it visually from analog NTC wiring.','Sensor interface diagram and caption now agree; hardware wiring remains device-specific.');

  get('m19-3-l1').items[0] = '<strong>Review device-specific debug protection</strong> — STM32 RDP levels are an STM32 example. For an nRF52 project, consult Nordic APPROTECT instructions for the exact silicon revision and SDK, including erase/recovery consequences. Plan and test recovery on designated hardware before applying protection; do not copy irreversible settings onto learner boards.';
  replace('m19-3-ex1','placeholder','Enable RDP Level 1 on nRF52 → Verify: attempt to read Flash via J-Link, confirm access denied','Document Nordic APPROTECT for the exact nRF52 silicon revision and SDK → Verify: review supported configuration and erase/recovery procedure before any designated-device test');
  replace('m19-3-def1','definitionHtml','RDP enabled, watchdog enabled, debug disabled','device-specific protection reviewed, watchdog configured and debug access deliberately controlled');
  get('m12-3-t4').html = '<p>On STM32 families that implement these RDP levels, Level 1 limits external Flash readout; lowering protection generally requires an erase. Level 2 can permanently restrict debug and bootloader access, but exact effects and permitted in-application update paths depend on the device. Do not treat this as a universal ban on all reprogramming. Read the exact part\'s reference manual and recovery limitations before changing protection; this lesson does not instruct learners to set irreversible protection.</p>';
  done('EF-12','Replaced nRF52 RDP instructions with revision-specific APPROTECT review; qualified adjacent STM32 Level 2 claim.','Nordic debug-protection documentation checked. No protection bits changed or recovery tested.');
  const rust = 'Safe Rust ownership and borrowing prevent many lifetime and data-race errors statically without a garbage collector. Safe array/slice indexing is bounds-checked and can panic at runtime; it is not always a compile-time check. Unsafe code and FFI require separately upheld safety contracts.';
  get('m7-2-t4').html = `<p>${rust}</p>`;
  option(q('m7-2-quiz1','q1'),'B','Ownership and borrowing prevent many memory-safety errors statically; safe indexing checks bounds and may panic at runtime');
  q('m7-2-quiz1','q1').explanation = rust;
  get('m13-3-l1').items[4] = `<strong>Consider Rust</strong> — ${rust}`;
  for (const questions of [bank, legacy]) {
    const question = questions.find(q => q.id === 'fe-q33'); assert(question);
    option(question,'B','Safe Rust prevents many lifetime and data-race errors statically and checks indexing bounds, which may panic at runtime');
    question.explanation = rust;
  }
  done('EF-13','Qualified Rust guarantees across prose, practice and both retained final banks.','Rust Reference array indexing semantics checked; question and option IDs/keys preserved.');

  get('m18-3-code1').code = `// Conceptual TFLM setup: pin the runtime and generate the model contract first.
// MODEL_INPUT_SHAPE and MODEL_INPUT_BYTES come from the reviewed training export.
// Helpers below are contracts, not supplied implementations.
bool tinyml_ready = false;
bool tinyml_init(void) {
    tinyml_ready = false;
    const tflite::Model *model = tflite::GetModel(gesture_model_tflite);
    if (model == nullptr || model->version() != TFLITE_SCHEMA_VERSION) return false;
    // Register exactly the required ops, checking every Add...() return value.
    if (!register_required_ops_checked(resolver)) return false;
    // Arena size/alignment must match the pinned runtime and model requirements.
    interpreter = construct_interpreter(model, resolver, tensor_arena, kArenaSize);
    if (interpreter == nullptr || interpreter->AllocateTensors() != kTfLiteOk) return false;
    if (interpreter->inputs_size() != 1 || interpreter->outputs_size() != 1) return false;
    input_tensor = interpreter->input(0);
    output_tensor = interpreter->output(0);
    if (input_tensor == nullptr || output_tensor == nullptr) return false;
    if (input_tensor->type != kTfLiteInt8 || output_tensor->type != kTfLiteInt8) return false;
    if (input_tensor->data.int8 == nullptr || output_tensor->data.int8 == nullptr) return false;
    if (!shape_equals(input_tensor->dims, MODEL_INPUT_SHAPE)) return false;
    if (input_tensor->bytes != MODEL_INPUT_BYTES) return false;
    // Reviewed classifier contract: one batch of four softmax class scores.
    if (!shape_equals(output_tensor->dims, {1, 4}) || output_tensor->bytes != 4) return false;
    if (!valid_per_tensor_int8_quantization(input_tensor) ||
        !valid_per_tensor_int8_quantization(output_tensor)) return false;
    // Quantization helper requires finite positive scale and int8-range zero point.
    tinyml_ready = true;
    return true;
}
// Call once at startup; never classify after false. No board/runtime build claimed.`;
  get('m18-3-code2').code = `// Conceptual inference, after successful checked initialization.
bool tinyml_classify(const int8_t *preprocessed_data, int data_len) {
    if (!tinyml_ready || preprocessed_data == nullptr || data_len < 0) return false;
    if ((size_t)data_len != input_tensor->bytes) return false;
    // Preprocessing must match model shape, order, scale and zero point.
    memcpy(input_tensor->data.int8, preprocessed_data, (size_t)data_len);
    if (interpreter->Invoke() != kTfLiteOk) return false;
    const char *class_names[] = {"none", "wave", "shake", "tap"};
    const int num_classes = sizeof(class_names) / sizeof(class_names[0]);
    // Recheck the output contract before reading it (including data pointer).
    if (output_tensor->type != kTfLiteInt8 || output_tensor->data.int8 == nullptr ||
        !shape_equals(output_tensor->dims, {1, num_classes}) ||
        output_tensor->bytes != (size_t)num_classes ||
        !valid_per_tensor_int8_quantization(output_tensor)) return false;
    int best_class = 0;
    for (int i = 1; i < num_classes; i++) {
        if (output_tensor->data.int8[i] > output_tensor->data.int8[best_class]) best_class = i;
    }
    const float score = (output_tensor->data.int8[best_class] - output_tensor->params.zero_point)
                        * output_tensor->params.scale;
    // This model contract says softmax probabilities; logits need different treatment.
    LOG_INFO("Detected: %s (dequantized score: %.3f)", class_names[best_class], score);
    // CONFIDENCE_THRESHOLD is a model-validation parameter, not a course pass score.
    if (best_class == 1 && score > CONFIDENCE_THRESHOLD) trigger_wave_action();
    return true;
}`;
  done('EF-14','Made initialization failures, input lengths, model tensor contracts and output quantization explicit.','Host contract cases cover allocation failure, wrong tensor shape/type, invalid input lengths and valid quantized output; conceptual helpers still need a pinned runtime implementation.');
  replace('m14-2-code1','code','snprintf(response, sizeof(response), "OK TEMP=%.1f PRES=%.1f",\n                 r.temperature_c, r.pressure_hpa);','if (s != TEMP_OK) {\n            snprintf(response, sizeof(response), "ERR TEMP_STATUS=%d", (int)s);\n        } else {\n            snprintf(response, sizeof(response), "OK TEMP=%.1f PRES=%.1f",\n                     r.temperature_c, r.pressure_hpa);\n        }');
  done('EF-15','Returns a structured error before accessing a failed sensor result.','Compiled host checks inject communication/timeout failure and validate successful wire format.');

  for (const questions of [bank, legacy]) {
    assert.equal(questions.length,35);
    questions.forEach((question, i) => {
      const original = question.options;
      const answer = original.find(o => o.id === question.correctAnswerId); assert(answer);
      const others = original.filter(o => o.id !== answer.id);
      const rotated = others.slice(i % others.length).concat(others.slice(0, i % others.length));
      rotated.splice(i % 4, 0, answer);
      question.options = rotated;
    });
  }
  assert.deepEqual(bank,legacy,'Retained banks diverged');
  done('EF-16','Balanced the retained derivative bank correct-option display positions (9/9/9/8), preserving stable option IDs and correctAnswerId.','All 35 mappings and duplicate-bank equality checked. This is static editorial ordering, not server attempt shuffling or an assessment release.');
  illustration('m16-2-ill1', hbridge, 'H-bridge switch topology with forward and reverse diagonal paths. S1/S2 are upper switches and S3/S4 lower switches. Same-leg pairs S1+S3 or S2+S4 short the supply. Brake shorts the motor through both upper or both lower switches; coast opens all four. Protection/recirculation components are omitted from this conceptual topology.');
  illustration('m17-4-ill1', lineFollower, 'Top-down conceptual robot with sensors numbered left 0 to right 4. For a left-of-centre line, positive P correction slows the left wheel and speeds the right. This illustrates the sign convention; it does not claim measured PID path performance.');
  done('EF-17','Replaced mismatched diagrams with actual H-bridge topology and sensor/wheel steering geometry, retained inline block positions.','SVG structure/labels and current paths checked; rendered desktop/mobile inspection is recorded separately.');
  const first = Object.values(content.modules[0].lessonContent)[0];
  assert(!first.blocks.some(b => b.id === 'armature-embedded-source-credit'));
  first.blocks.push({id:'armature-embedded-source-credit',type:'text',content:{html:'<p><strong>Source acknowledgement.</strong> The preserved authoring guide identifies <a href="https://www.freecodecamp.org/news/learn-embedded-systems-firmware-basics-handbook-for-devs/">Learn Embedded Systems Firmware Basics – A Handbook for Developers</a> by Soham Banerjee, published by freeCodeCamp on 23 June 2025, as a source reference. This Armature edition preserves the imported course structure and records subsequent editorial corrections separately.</p>'}});
  done('EF-18','Added learner-visible author, article title, publisher/date and link while retaining the original authoring prompt.','Source byline/date verified. Specific reuse permission remains an editorial follow-up; attribution is not a licensing determination.');
  get('m19-2-l2').items[1] = '<strong>I²C driver</strong> — For the SHT3x-DIS SHT31 interface, send status-read command bytes <code>0xF3, 0x2D</code>, read two status bytes plus their CRC byte, and validate CRC-8 (polynomial 0x31, initial value 0xFF) before interpreting status. Confirm the selected device revision, I²C address and transaction timing against its datasheet; do not invent a device-ID register.';
  done('EF-19','Replaced the unspecified device-ID register with documented SHT3x-DIS status read and CRC.','Datasheet command/CRC reviewed and CRC reference-vector host check; no I²C hardware transaction claimed.');
  replace('m7-3-code3','code','// Bitfield struct packing multiple flags into one byte','// Implementation/ABI-dependent bitfield example, not a serialized wire format');
  replace('m7-3-code3','code','// Total: exactly 1 byte (8 bits)','// Intended target size: 1 byte; verify sizeof(MotorStatus) on that compiler/ABI.\n// uint8_t bitfield support/layout is implementation-defined. Use explicit uint8_t\n// masks when fixed register or serialized representation is required.');
  done('EF-20','Qualified bitfield size/layout and directed fixed representations to explicit masks.','Text check; no portable one-byte ABI claim retained.');
  replace('m10-1-code1','code','// Run every 100 ms','// Delay 100 ms AFTER work/queue wait; not an exact 100 ms period');
  done('EF-21','Described relative task delay accurately.','The preceding blocking queue send and work remain visible; no periodic deadline claim.');
  return findings;
}
