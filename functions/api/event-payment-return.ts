export function onRequestPost({ request }: { request: Request }) {
  const reference = new URL(request.url).searchParams.get("booking") ?? "";
  const params = new URLSearchParams({ item: "event" });
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(reference)) {
    params.set("paymentReturn", reference);
  }
  // The signed-in booking page verifies the bound order independently with Razorpay.
  return new Response(null, {
    status: 303,
    headers: { Location: "/bookings/?" + params + "#steps", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
