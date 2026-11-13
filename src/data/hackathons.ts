export type HackathonBuild = {
  slug: string;
  title: string;
  builder: string;
  institution: string;
  metric: string;
  metricLabel: string;
  task: string;
  robot: string;
  data: string;
  approach: string;
  image: { src: string; alt: string; width: number; height: number; position?: string };
  videoUrl: string;
  videoLabel: string;
  repoUrl: string;
};

export type Hackathon = {
  slug: string;
  name: string;
  tagline: string;
  dates: string;
  format: string;
  lede: string;
  lumaUrl: string;
  hosts: string;
  prize: string;
  stats: { value: string; label: string }[];
  brief: string;
  hardRule: string;
  criteria: { title: string; text: string }[];
  evaluationNote: string;
  buildsHeading: string;
  builds: HackathonBuild[];
  partners: { name: string; text: string }[];
};

const media = "/resources/hackathons/humanoid-challenge-2026";

export const humanoidChallenge2026: Hackathon = {
  slug: "humanoid-challenge-2026",
  name: "Teach a Humanoid With Your Own Hands",
  tagline: "Humanoid Challenge 2026",
  dates: "26 October to 4 November 2026",
  format: "Online",
  lede: "We skipped the resume screen. Builders filmed themselves doing a simple task on a phone, then used that footage to make a Unitree G1 humanoid do it in simulation. Here are the ten strongest submissions.",
  lumaUrl: "https://luma.com/784lh668",
  hosts: "Awign (a Mynavi company) and Armature AI Labs, with RIC (Robotics India Community) and Tanna TechBiz (NVIDIA Preferred Partner).",
  prize: "Paid 2-month robot learning internships with Awign in Bangalore.",
  stats: [
    { value: "160+", label: "builders applied" },
    { value: "19", label: "submissions with public code and their own recorded data" },
    { value: "10", label: "days from launch to deadline" },
    { value: "15 of 19", label: "drove a Unitree G1 in MuJoCo" }
  ],
  brief: "Collect a small manipulation dataset yourself, then use it to drive a humanoid or dexterous hand in simulation. Post-train a policy, retarget your hand to a five-finger hand, push success up with RL, try a world model, or make a policy run faster. Any route was open.",
  hardRule: "The data you personally recorded has to play a real role in your approach.",
  criteria: [
    { title: "Creativity", text: "As long as your own footage genuinely shaped the result." },
    { title: "Results", text: "How well the robot performs in simulation, on layouts it has not seen." },
    { title: "Clarity", text: "A simple implementation and an honest write-up of what worked and what did not." }
  ],
  evaluationNote: "Every repository was cloned and read by the organisers, and run where it could run on a CPU. Judges Varun and Vaish reviewed every submission. Numbers below are as each builder reported them in their own write-up.",
  buildsHeading: "The top 10 builds",
  builds: [
    {
      slug: "harsh-patil",
      title: "A standing G1 that learned two tasks",
      builder: "Harsh Patil",
      institution: "Hochschule Coburg",
      metric: "65%",
      metricLabel: "success on 860 new random starts, from one camera-based policy",
      task: "Pick and place a cylinder, and stand a lying cylinder upright",
      robot: "Standing Unitree G1 with a five-finger Inspire hand",
      data: "54 phone clips, turned into 3,857 simulated demos",
      approach: "ACT vision policy, compared with Diffusion Policy",
      image: { src: `${media}/harsh.jpg`, alt: "The G1 picking and placing cylinders, seen from six camera views", width: 960, height: 540 },
      videoUrl: "https://youtu.be/CvTkpJ8X3cs",
      videoLabel: "Watch the walkthrough",
      repoUrl: "https://github.com/sca7r/humanoid-challenge"
    },
    {
      slug: "aneesh-deepak-lade",
      title: "palm2policy",
      builder: "Aneesh Deepak Lade",
      institution: "IIT Kharagpur",
      metric: "81%",
      metricLabel: "success on 300 layouts the policy had never seen",
      task: "Pick up a tub and place it on a notebook",
      robot: "Unitree G1 with a Dex3 hand",
      data: "25 phone clips, no markers",
      approach: "Retargeting, physics-checked augmentation and an ACT policy",
      image: { src: `${media}/aneesh.jpg`, alt: "Aneesh moving a tub, beside the G1 doing the same in simulation", width: 960, height: 506 },
      videoUrl: "https://github.com/ani26052007/palm2policy",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/ani26052007/palm2policy"
    },
    {
      slug: "angelo-antu",
      title: "A cup pyramid and a cap throw",
      builder: "Angelo Antu",
      institution: "Cochin University of Science and Technology",
      metric: "45%",
      metricLabel: "of full runs built the pyramid and landed the throw in simulation",
      task: "Stack three cups into a pyramid, then throw a cap into the top cup",
      robot: "Unitree G1 with a five-finger Shadow hand",
      data: "Phone videos with a printed marker sheet",
      approach: "Imitation, diffusion, PPO and a SmolVLA, plus a real-hardware-limits mode",
      image: { src: `${media}/angelo.jpg`, alt: "Eight frames of the G1 stacking red cups into a pyramid", width: 960, height: 360 },
      videoUrl: "https://github.com/ANGELOANTU7/Robot_arm",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/ANGELOANTU7/Robot_arm"
    },
    {
      slug: "aditya-sharma",
      title: "dexcup: call the big policy only when it matters",
      builder: "Aditya Sharma",
      institution: "Delhi Technological University",
      metric: "3x",
      metricLabel: "less compute at 76% success, by calling the large policy only during grasp and place",
      task: "Place a cardboard tube on a tape-roll coaster",
      robot: "Unitree G1 with a Dex3 hand",
      data: "62 egocentric iPhone clips",
      approach: "A large teacher, a small student and a router between them",
      image: { src: `${media}/aditya.jpg`, alt: "The G1 holding a tube above a coaster in simulation", width: 960, height: 368 },
      videoUrl: "https://github.com/adityavivek11/dexcup",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/adityavivek11/dexcup"
    },
    {
      slug: "khushali-patel",
      title: "Paper Hands",
      builder: "Khushali Patel",
      institution: "San José State University",
      metric: "20/20",
      metricLabel: "randomized trials, with grip held near 1.9 N by fingertip touch",
      task: "Slide a sheet of paper, pinch it, and lay it inside a taped target",
      robot: "Unitree G1 with a Dex3 hand and fingertip touch sensors",
      data: "Two cameras, front and top",
      approach: "Retargeting with touch-controlled grip",
      image: { src: `${media}/khushali.jpg`, alt: "Khushali sliding a red sheet, beside the G1 placing a sheet inside a red target", width: 960, height: 508 },
      videoUrl: "https://github.com/khushali-patel1299/Humanoid-Challenge",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/khushali-patel1299/Humanoid-Challenge"
    },
    {
      slug: "vasanth-k",
      title: "Phone video to humanoid",
      builder: "Vasanth K",
      institution: "IIT Delhi",
      metric: "25 of 32",
      metricLabel: "recordings completed, and 5 of 8 clips the controller had never seen",
      task: "Move a cup onto a coaster",
      robot: "Unitree G1 with a five-finger Inspire hand",
      data: "46 iPhone clips, 32 labelled by hand",
      approach: "One contact-checked controller shared across every clip",
      image: { src: `${media}/vasanth.jpg`, alt: "A tracked hand over a coaster, above the G1 holding a cup", width: 960, height: 1080, position: "center 25%" },
      videoUrl: "https://github.com/benzene73/hand-to-humanoid",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/benzene73/hand-to-humanoid"
    },
    {
      slug: "ankam-sriman",
      title: "Video2Robot",
      builder: "Ankam Sriman",
      institution: "IIT Kharagpur",
      metric: "20 of 26",
      metricLabel: "of his own videos reproduced by the robot, built on a laptop with no GPU",
      task: "Stack steel glasses into a triangle and flip the last one",
      robot: "Unitree G1 using both arms",
      data: "Webcam videos, no markers or labels",
      approach: "The video decides which glass moves, in what order, and with which arm",
      image: { src: `${media}/ankam.jpg`, alt: "A person stacking steel glasses, beside the G1 stacking them in simulation", width: 960, height: 340 },
      videoUrl: "https://github.com/ankamsriman/Video2Robot",
      videoLabel: "Watch the reel",
      repoUrl: "https://github.com/ankamsriman/Video2Robot"
    },
    {
      slug: "abhishek-rajdhar-dubey",
      title: "Copy the pen, not the hand",
      builder: "Abhishek Rajdhar Dubey",
      institution: "Ajay Kumar Garg Engineering College",
      metric: "29/40",
      metricLabel: "new layouts solved by copying what the pen did, against 0 for copying the hand",
      task: "Pick up a pen and drop it into a pen cup",
      robot: "Unitree G1 with a Dex3 hand",
      data: "10 phone clips",
      approach: "Four ways to transfer a demo, compared on the same layouts",
      image: { src: `${media}/abhishek.jpg`, alt: "Four G1 robots trying the pen task with four transfer methods", width: 960, height: 360 },
      videoUrl: "https://github.com/abhishekrajdhar/human2humanoid",
      videoLabel: "Watch the comparison",
      repoUrl: "https://github.com/abhishekrajdhar/human2humanoid"
    },
    {
      slug: "dhanush",
      title: "Dog2go: a robot that walks like his dog",
      builder: "Dhanush",
      institution: "Dayananda Sagar University",
      metric: "1.16 m",
      metricLabel: "walked by a quadruped from 8 seconds of his own dog, without falling",
      task: "Walk with the gait recorded from his dog",
      robot: "Unitree Go2 quadruped, a deliberate step outside the humanoid brief",
      data: "One 8-second phone clip of his dog",
      approach: "Pose extraction, gait retargeting and physics replay",
      image: { src: `${media}/dhanush.jpg`, alt: "Dhanush's dog walking, beside the Go2 robot copying its gait", width: 960, height: 450 },
      videoUrl: "https://github.com/Creative-Dhanush/Dog2go",
      videoLabel: "Watch the demo",
      repoUrl: "https://github.com/Creative-Dhanush/Dog2go"
    },
    {
      slug: "akanksha-parija",
      title: "A five-finger hand from one phone take",
      builder: "Akanksha Parija",
      institution: "Plaksha University",
      metric: "63",
      metricLabel: "hand-annotated trials replayed on a five-finger hand, with every error reported",
      task: "Pick up a cup and place it on a sticky note",
      robot: "Shadow hand in MuJoCo",
      data: "One continuous 4K phone take",
      approach: "Hand-pose retargeting with fingertip-contact grasp checks",
      image: { src: `${media}/akanksha.jpg`, alt: "Phone footage with hand landmarks, beside a simulated hand carrying a cup", width: 960, height: 412 },
      videoUrl: "https://github.com/AkankshaParija/awign-humanoid-challenge",
      videoLabel: "Watch the clips",
      repoUrl: "https://github.com/AkankshaParija/awign-humanoid-challenge"
    }
  ],
  partners: [
    { name: "Awign", text: "A Mynavi company. Robotics data collection at scale." },
    { name: "Armature AI Labs", text: "A shared physical AI and robotics lab in HSR Layout, Bangalore." },
    { name: "RIC", text: "Robotics India Community." },
    { name: "Tanna TechBiz", text: "Physical AI solutions, NVIDIA Preferred Partner." }
  ]
};

export const hackathons: Hackathon[] = [humanoidChallenge2026];

export const hackathonPath = (hackathon: Hackathon) => `/resources/hackathons/${hackathon.slug}`;
