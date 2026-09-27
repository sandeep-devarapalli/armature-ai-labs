import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, CheckCircle2, KeyRound, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { Status } from "../components/Primitives";
import { useApp } from "../context/AppContext";
import {
  enrollKiosk,
  hasEnrolledKiosk,
  scanMemberToken
} from "../lib/kioskDevice";

function tokenFromPayload(payload: string) {
  if (payload.startsWith("armature://")) {
    return new URL(payload).searchParams.get("token") ?? "";
  }
  return payload.trim();
}

export function KioskPage() {
  const { redeemCheckinIntent, mode, online } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [manual, setManual] = useState("");
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [enrolled, setEnrolled] = useState(mode === "demo");
  const [checkingEnrollment, setCheckingEnrollment] = useState(mode !== "demo");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ good: boolean; text: string } | null>(null);

  useEffect(() => {
    if (mode === "demo") return;
    void hasEnrolledKiosk()
      .then(setEnrolled)
      .finally(() => setCheckingEnrollment(false));
  }, [mode]);

  useEffect(
    () => () => {
      controlsRef.current?.stop();
    },
    []
  );

  async function redeem(payload: string) {
    try {
      const token = tokenFromPayload(payload);
      if (!token) throw new Error("No check-in token was found.");
      if (mode === "demo") {
        setResult({ good: true, text: await redeemCheckinIntent(token) });
      } else {
        const scan = await scanMemberToken(token);
        const action = scan.equipment_session
          ? (scan.action === "check_out" ? "Equipment return" : "Equipment use")
          : (scan.action === "check_out" ? "Check-out" : "Check-in");
        setResult({ good: true, text: `${action} recorded.` });
      }
      setManual("");
      controlsRef.current?.stop();
      setScanning(false);
    } catch (reason) {
      setResult({ good: false, text: reason instanceof Error ? reason.message : "Scan failed." });
    }
  }

  async function startScanner() {
    if (!videoRef.current || !online) return;
    setResult(null);
    setScanning(true);
    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (scanResult, error) => {
          if (scanResult) void redeem(scanResult.getText());
          if (error && error.name !== "NotFoundException") {
            setResult({ good: false, text: "Camera scan interrupted." });
          }
        }
      );
    } catch (reason) {
      setScanning(false);
      setResult({ good: false, text: reason instanceof Error ? reason.message : "Camera access failed." });
    }
  }

  return (
    <div className="kiosk-shell">
      <header className="kiosk-header">
        <BrandMark />
        <div><span className={online ? "dot dot-good" : "dot dot-bad"} />{online ? "on-site kiosk online" : "offline · scanning disabled"}</div>
        <Status tone={mode === "demo" ? "warn" : "good"}>{mode}</Status>
      </header>
      <main className="kiosk-main">
        <section className="kiosk-scan">
          <div className="kiosk-title"><ScanLine aria-hidden="true" /><div><span className="mono">Trusted device · KIOSK-01</span><h1>Scan member code</h1><p>Hold the one-use QR inside the frame. The member remains responsible for the booking and declared guests.</p></div></div>
          <div className={`camera-frame ${scanning ? "scanning" : ""}`}>
            <video ref={videoRef} muted playsInline aria-label="Kiosk QR scanner camera" />
            {!scanning && <div className="camera-idle"><Camera aria-hidden="true" /><span>Camera stopped</span></div>}
            <i className="scan-corner top-left" /><i className="scan-corner top-right" /><i className="scan-corner bottom-left" /><i className="scan-corner bottom-right" />
          </div>
          <button className="button button-primary button-wide" type="button" onClick={startScanner} disabled={scanning || !online || !enrolled}><Camera aria-hidden="true" />{scanning ? "Scanner active" : enrolled ? "Start camera scanner" : "Enroll this kiosk first"}</button>
        </section>
        <aside className="kiosk-side">
          {result ? (
            <div className={`scan-result ${result.good ? "success" : "failure"}`} role="status">
              {result.good ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
              <span className="mono">{result.good ? "Access recorded" : "Access denied"}</span>
              <h2>{result.text}</h2>
              <button type="button" className="button button-quiet" onClick={() => setResult(null)}>Scan next member</button>
            </div>
          ) : (
            <>
              {mode === "supabase" && !enrolled && !checkingEnrollment && (
                <form
                  className="manual-code kiosk-enrollment"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setResult(null);
                    void enrollKiosk(enrollmentToken)
                      .then(() => {
                        setEnrolled(true);
                        setEnrollmentToken("");
                      })
                      .catch((reason: Error) =>
                        setResult({ good: false, text: reason.message })
                      );
                  }}
                >
                  <label htmlFor="enrollment-token">One-use staff enrollment token</label>
                  <input id="enrollment-token" value={enrollmentToken} onChange={(event) => setEnrollmentToken(event.target.value)} placeholder="Enter the 10-minute token" />
                  <button className="button button-primary" type="submit" disabled={!enrollmentToken || !online}>Enroll kiosk</button>
                </form>
              )}
              {enrolled && <div className="kiosk-rule"><KeyRound aria-hidden="true" /><div><h3>Enrolled device key</h3><p>The signing key is non-exportable and remains in this browser.</p></div></div>}
              <div className="kiosk-rule"><KeyRound aria-hidden="true" /><div><h3>One use · 60 seconds</h3><p>Replay and expired codes are rejected.</p></div></div>
              <div className="kiosk-rule"><ShieldAlert aria-hidden="true" /><div><h3>Booking window enforced</h3><p>15 minutes before to 30 minutes after start.</p></div></div>
              <form className="manual-code" onSubmit={(event) => { event.preventDefault(); void redeem(manual); }}>
                <label htmlFor="manual-token">Manual token fallback</label>
                <input id="manual-token" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Paste token from member screen" />
                <button className="button button-quiet" type="submit" disabled={!manual || !online || !enrolled}>Validate code</button>
              </form>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
