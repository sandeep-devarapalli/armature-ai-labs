export type EquipmentListing = {
  code: string;
  category: string;
  maker: string;
  name: string;
  version: string;
  summary: string;
  images: { src: string; alt: string }[];
  stock: { units: number; free: number; note?: string } | null;
  dayPaise?: number;
  salePaise: number | null;
  addOns?: string[];
  weekPaise: number | null;
  monthPaise: number | null;
  depositPaise: number | null;
  highlights: string[];
  specs: [string, string][];
  parts: [string, string][];
  partsNote: string;
  source: { label: string; url: string };
};

// Specs and parts from the makers' product pages, 9 Nov 2026. Prices and stock from the owner, 9 Nov 2026.
export const equipment: EquipmentListing[] = [
  {
    code: "hiwonder",
    category: "Robot arm",
    maker: "Hiwonder",
    name: "LeRobot SO-101 Advanced Kit",
    version: "Advanced Kit · assembled",
    summary: "A leader and follower arm pair with two cameras, ready for teleoperation and imitation learning with Hugging Face LeRobot.",
    images: [
      { src: "/media/equipment/hiwonder-so101-1.jpg", alt: "Hiwonder SO-101 leader and follower arms" },
      { src: "/media/equipment/hiwonder-so101-2.jpg", alt: "Leader arm teleoperating the follower arm, training and autonomous picking" },
      { src: "/media/equipment/hiwonder-so101-box.jpg", alt: "Advanced Kit packing list laid out" }
    ],
    stock: { units: 1, free: 0, note: "currently rented" },
    salePaise: 5500000,
    weekPaise: 105000,
    monthPaise: 390000,
    depositPaise: 2500000,
    highlights: ["Arrives assembled; no build time", "Leader-follower teleoperation", "Gripper camera plus external camera", "Trains ACT, π0 and SmolVLA policies"],
    specs: [
      ["Degrees of freedom", "6 per arm"],
      ["Follower servos", "6 × HX-30HM bus servo, 30 kg·cm, magnetic encoder"],
      ["Leader servos", "6 × HX-10HM bus servo"],
      ["Controller", "BusLinker V3.0 servo debugging board"],
      ["Cameras", "0.3 MP 480p wide-angle (gripper), 2 MP 1080p wide-angle (mount)"],
      ["Power", "12 V 5 A (DC 4.0 × 1.7)"],
      ["Connection", "USB serial"],
      ["Software", "Hugging Face LeRobot, Python; Windows or Ubuntu"],
      ["Material", "PLA, 3D printed"],
      ["Leader arm", "111 × 239 × 525 mm, 697 g"],
      ["Follower arm", "111 × 173 × 532 mm, 704 g"],
      ["Camera mount", "166 × 258 × 527 mm, 1,178 g"]
    ],
    parts: [
      ["Leader arm, assembled", "1"],
      ["Follower arm, assembled", "1"],
      ["Camera mount arm", "1"],
      ["HD camera", "2"],
      ["4-port USB hub", "1"],
      ["USB cable", "4"],
      ["12 V power adapter", "2"],
      ["Table clamp", "4"],
      ["Screwdriver", "2"],
      ["Spare servo cables, horns, cable ties and screws", "1 set"]
    ],
    partsNote: "Read from Hiwonder's Advanced Kit packing list. Staff check every part at handover and return.",
    source: { label: "Hiwonder product page", url: "https://www.hiwonder.com/products/lerobot-so-101?variant=42198960242775" }
  },
  {
    code: "thinkrobotics-so101",
    category: "Robot arm",
    maker: "ThinkRobotics",
    name: "LeRobot SO-101 6-Axis Robotic Arm",
    version: "12 V follower upgrade · SKU LERO0001",
    summary: "The official open-source SO-101 leader and follower pair, with higher-torque 12 V servos on the follower arm.",
    images: [
      { src: "/media/equipment/thinkrobotics-so101-1.jpg", alt: "ThinkRobotics SO-101 follower arm" },
      { src: "/media/equipment/thinkrobotics-so101-3.jpg", alt: "ThinkRobotics SO-101 arm, second view" },
      { src: "/media/equipment/thinkrobotics-so101-colours.jpg", alt: "SO-101 printed parts come in red or black" }
    ],
    stock: { units: 1, free: 0, note: "reserved for a buyer" },
    salePaise: 3100000,
    addOns: ["waveshare-ov5693"],
    weekPaise: 80000,
    monthPaise: 250000,
    depositPaise: 2500000,
    highlights: ["Follower arm up to 30 kg·cm stall torque", "Leader-follower teleoperation", "Stays in sync with the Hugging Face SO-101 project", "No camera included; add one below"],
    specs: [
      ["Degrees of freedom", "6 per arm"],
      ["Follower servos", "6 × STS3215 12 V, 1/345 gear, up to 30 kg·cm"],
      ["Leader servos", "6 × STS3215 7.4 V: 1 × 1/345, 2 × 1/191, 3 × 1/147"],
      ["Controller", "2 × motor control board"],
      ["Power", "12 V 7.5 A (follower), 5 V 6 A (leader)"],
      ["Connection", "USB-C"],
      ["Software", "Hugging Face LeRobot, Python"],
      ["Camera", "Not included"],
      ["Printed parts", "Red or black, as supplied"]
    ],
    parts: [
      ["3D-printed arm parts (no camera mount)", "1 set"],
      ["STS3215 servo 12 V, 1/345 gear", "6"],
      ["STS3215 servo 7.4 V, 1/345 gear", "1"],
      ["STS3215 servo 7.4 V, 1/191 gear", "2"],
      ["STS3215 servo 7.4 V, 1/147 gear", "3"],
      ["Motor control board", "2"],
      ["USB-C to USB-C cable, 2 m", "2"],
      ["Power supply 5 V 6 A", "1"],
      ["Power supply 12 V 7.5 A", "1"],
      ["Table clamp", "4"]
    ],
    partsNote: "From ThinkRobotics' parts list. Staff check every part at handover and return.",
    source: { label: "ThinkRobotics product page", url: "https://thinkrobotics.com/products/so-arm101-hugging-face-lerobot" }
  },
  {
    code: "waveshare-ov5693",
    category: "Camera",
    maker: "Waveshare",
    name: "OV5693 5MP USB Camera (A)",
    version: "Auto-focus · SKU 24710",
    summary: "A 5 MP auto-focus USB camera with dual microphones, for recording LeRobot episodes alongside an arm.",
    images: [
      { src: "/media/equipment/waveshare-ov5693-1.jpg", alt: "Waveshare OV5693 5MP USB camera module" },
      { src: "/media/equipment/waveshare-ov5693-2.jpg", alt: "OV5693 camera module features" },
      { src: "/media/equipment/waveshare-ov5693-size.jpg", alt: "OV5693 camera outline dimensions" }
    ],
    stock: { units: 0, free: 0, note: "2 on order" },
    salePaise: 400000,
    dayPaise: 20000,
    weekPaise: 100000,
    monthPaise: 200000,
    depositPaise: null,
    highlights: ["5 MP OV5693 sensor, auto-focus", "135° diagonal field of view", "USB 2.0, no driver needed", "Onboard dual microphones"],
    specs: [
      ["Sensor", "OV5693, 1/4 inch, 5 MP"],
      ["Interface", "USB 2.0"],
      ["Focus", "Auto-focus"],
      ["Lens", "f/2.1, 2.5 mm focal length"],
      ["Field of view", "135° diagonal, 95° horizontal, 70° vertical"],
      ["Still image", "2592 × 1944"],
      ["Video (MJPG)", "Up to 2592 × 1944 at 15 fps; 1080p, 720p and 480p at 15 fps"],
      ["Video (YUY2)", "1080p at 5 fps, 720p at 10 fps, 480p at 15 fps"],
      ["Audio", "Onboard dual microphones"],
      ["Power", "5 V ± 5%, 500 mA"],
      ["Size", "Camera 18 × 18 × 19.69 mm; module 18 × 40 mm"]
    ],
    parts: [["OV5693 5MP USB Camera (A)", "1"]],
    partsNote: "Full box contents are checked when the stock arrives.",
    source: { label: "Waveshare product page", url: "https://www.waveshare.com/ov5693-5mp-usb-camera-a.htm" }
  }
];

export const findEquipment = (code: string | undefined) => equipment.find(item => item.code === code);
