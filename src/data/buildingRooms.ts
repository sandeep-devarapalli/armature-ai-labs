import releasedRooms from "./buildingRoomServices.json" with { type: "json" };

// Current user-confirmed room descriptions; the issued R06 service catalog stays immutable.
const rooms = releasedRooms.map((room) => room.id === "GF-03" ? {
  ...room,
  name: "Bathroom",
  purpose: "Existing bathroom accessed through GF-01.",
  status: "Confirmed bathroom",
  modelNote: "Bathroom use is confirmed. Existing access through GF-01 is retained; dimensions and fixtures remain approximate.",
  socketNote: "No new general-purpose positions budgeted; existing wet-area services still need checks. Zero does not mean no existing sockets.",
  acNote: "Ventilation remains unresolved; no AC provision is confirmed.",
  holds: ["Check existing bathroom fixtures and ventilation.", "Preserve GF-01 access.", "No wet-area electrical specification or new office use is approved."]
} : room);

export default rooms;
