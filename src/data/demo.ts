import { addHours, addDays, startOfHour } from "date-fns";
import type { DemoState, Resource } from "../types/domain";

export const resources: Resource[] = [
  {
    id: "res-arm",
    slug: "robot-arm-cell",
    name: "Robot arm cell",
    kind: "robotics",
    zone: "Zone 06",
    description: "Guarded robot arm, controller, safety interlocks, and calibrated work surface.",
    capacity: 2,
    maxGuests: 0,
    durationMinutes: 60,
    maxDurationMinutes: 240,
    bookingHorizonDays: 30,
    certifications: ["Arm cell induction"],
    hazardous: true,
    available: true,
    image: "/project-images/lerobot-so-arm-official.webp"
  },
  {
    id: "res-soarm",
    slug: "so-arm-bench",
    name: "SO-ARM learning bench",
    kind: "robotics",
    zone: "Zone 04",
    description: "Leader/follower SO-ARM pair with LeRobot workstation and two calibrated cameras.",
    capacity: 3,
    maxGuests: 1,
    durationMinutes: 60,
    maxDurationMinutes: 240,
    bookingHorizonDays: 30,
    certifications: ["Lab induction"],
    hazardous: false,
    available: true,
    image: "/project-images/lerobot-so-arm-official.webp"
  },
  {
    id: "res-gpu",
    slug: "gpu-compute",
    name: "GPU compute node",
    kind: "compute",
    zone: "Zone 10",
    description: "Shared CUDA workstation for training, inference, simulation, and batch robotics workloads.",
    capacity: 1,
    maxGuests: 0,
    durationMinutes: 60,
    maxDurationMinutes: 240,
    bookingHorizonDays: 30,
    certifications: [],
    hazardous: false,
    available: true,
    image: "/project-images/autonomous-computer-official.webp"
  },
  {
    id: "res-electronics",
    slug: "electronics-bench",
    name: "ESD electronics bench",
    kind: "electronics",
    zone: "Zone 05",
    description: "Grounded mat, bench supply, oscilloscope, soldering station, extraction, and hand tools.",
    capacity: 2,
    maxGuests: 1,
    durationMinutes: 60,
    maxDurationMinutes: 240,
    bookingHorizonDays: 30,
    certifications: ["Lab induction"],
    hazardous: false,
    available: true
  },
  {
    id: "res-pod",
    slug: "builder-pod",
    name: "Builder pod",
    kind: "workspace",
    zone: "Zone 03",
    description: "Dedicated desk, lockable project storage, power, lab network, and shared monitor.",
    capacity: 2,
    maxGuests: 1,
    durationMinutes: 60,
    maxDurationMinutes: 240,
    bookingHorizonDays: 30,
    certifications: [],
    hazardous: false,
    available: true
  }
];

const nextSession = addDays(startOfHour(new Date()), 1);

export const initialDemoState: DemoState = {
  currentUserId: null,
  profiles: [
    {
      id: "member-demo",
      handle: "anika-builds",
      name: "Anika Rao",
      avatarUrl: "",
      bio: "Robotics engineer building tactile grippers and practical manipulation datasets.",
      skills: ["Robot learning", "CAD", "Tactile sensing"],
      organization: "Independent",
      projectLinks: [{ label: "Open gripper notes", url: "https://github.com/" }],
      socialLinks: [{ label: "GitHub", url: "https://github.com/" }],
      email: "anika@example.com",
      phone: "+91 90000 00000",
      emergencyContact: "Demo contact · +91 90000 00001",
      membershipState: "active",
      certifications: ["Lab induction", "Arm cell induction"]
    },
    {
      id: "member-pending",
      handle: "vivek-makes",
      name: "Vivek Menon",
      bio: "Mechanical designer prototyping low-cost mobile robots.",
      skills: ["Mechanical design", "3D printing"],
      organization: "Makers Guild",
      projectLinks: [],
      socialLinks: [],
      email: "vivek@example.com",
      phone: "",
      emergencyContact: "",
      membershipState: "pending",
      certifications: []
    },
    {
      id: "member-active",
      handle: "meera-vision",
      name: "Meera Iyer",
      bio: "Computer vision researcher working on on-device perception.",
      skills: ["Computer vision", "CUDA", "Edge AI"],
      organization: "Field Systems",
      projectLinks: [],
      socialLinks: [],
      email: "meera@example.com",
      phone: "",
      emergencyContact: "",
      membershipState: "active",
      certifications: ["Lab induction"]
    }
  ],
  resources,
  bookings: [
    {
      id: "booking-demo",
      resourceId: "res-soarm",
      ownerId: "member-demo",
      startsAt: nextSession.toISOString(),
      endsAt: addHours(nextSession, 2).toISOString(),
      purpose: "Collect teleoperation demonstrations for a grasping baseline.",
      guestNames: ["Rohan"],
      state: "confirmed",
      createdAt: new Date().toISOString()
    }
  ],
  attendance: [],
  checkinIntents: [],
  applications: [
    {
      id: "application-pending",
      memberId: "member-pending",
      buildSummary: "A serviceable indoor rover that can map workshop aisles.",
      requestedAt: new Date().toISOString(),
      state: "pending"
    }
  ],
  calendarSync: [
    {
      id: "sync-demo",
      bookingId: "booking-demo",
      resourceId: "res-soarm",
      operation: "create",
      state: "synced",
      attempts: 1,
      message: "Mirrored to resource calendar"
    }
  ]
};
