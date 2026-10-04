export const resourceCategories = [
  { id: 'all', label: 'All resources' },
  { id: 'electronics', label: 'Electronics & PCB' },
  { id: 'cad', label: 'Mechanical CAD' },
  { id: 'simulation', label: 'Simulation & learning' },
  { id: 'integrations', label: 'MCP integrations' },
  { id: 'projects', label: 'Projects & inspiration' },
] as const

export type ResourceCategoryId = (typeof resourceCategories)[number]['id']

export interface BuilderResource {
  id: string
  name: string
  category: Exclude<ResourceCategoryId, 'all'>
  summary: string
  url: string
  caution?: string
}

export interface BuilderProject {
  id: string
  name: string
  summary: string
  steps: string[]
  checks: string
  resourceIds: string[]
}

export const builderResources: BuilderResource[] = [
  { id: 'copperpilot', name: 'CopperPilot', category: 'electronics', summary: 'AI assistance for existing electronics-design workflows.', url: 'https://copperpilot.ai/', caution: 'Confirm support for your application, OS, version and intended operation.' },
  { id: 'build123d', name: 'build123d', category: 'cad', summary: 'Python-based parametric parts with editable source.', url: 'https://github.com/gumyr/build123d', caution: 'Pin versions and check dimensions, solid validity and exported geometry.' },
  { id: 'lerobot', name: 'LeRobot', category: 'simulation', summary: 'Tools and examples for robot-learning workflows.', url: 'https://huggingface.co/docs/lerobot/index', caution: 'Match hardware, calibration and software instructions before physical experiments.' },
  { id: 'blenderproc', name: 'BlenderProc', category: 'simulation', summary: 'Repeatable scenes for images, depth and labels.', url: 'https://github.com/DLR-RM/BlenderProc', caution: 'Check label alignment, camera intrinsics and depth units; test on real images too.' },
  { id: 'heypcb', name: 'heypcb', category: 'electronics', summary: 'AI-assisted PCB design using native KiCad outputs.', url: 'https://heypcb.ai/', caution: 'Vendor-described capabilities; review circuits and fabrication outputs.' },
  { id: 'blueprint', name: 'Blueprint', category: 'electronics', summary: 'Plan prototypes with parts lists, wiring and assembly guidance.', url: 'https://www.blueprint.io/', caution: 'Confirm current exports; do not assume editable PCB or parametric CAD output.' },
  { id: 'copperhead', name: 'copperhead', category: 'electronics', summary: 'Agent-assisted edits to native KiCad projects.', url: 'https://github.com/copperheadhq/copperhead', caution: 'Early-stage; review generated layouts. Electrical and layout checks do not prove functionality.' },
  { id: 'flux', name: 'Flux', category: 'electronics', summary: 'Browser-based PCB design and AI-assisted collaboration.', url: 'https://www.flux.ai/', caution: 'Evaluate import and export fidelity before moving an existing project.' },
  { id: 'quilter', name: 'Quilter', category: 'electronics', summary: 'PCB placement and routing from a prepared schematic and outline.', url: 'https://www.quilter.ai/', caution: 'Supply accurate constraints and review layout candidates as an engineer.' },
  { id: 'atopile', name: 'atopile', category: 'electronics', summary: 'Reusable circuit modules and hardware-as-code with KiCad.', url: 'https://atopile.io/', caution: 'Pin compatible tool and KiCad versions; verify module electrical assumptions.' },
  { id: 'jitx', name: 'JITX', category: 'electronics', summary: 'Software-defined electronics and repeatable board generation.', url: 'https://www.jitx.com/', caution: 'A specialized engineering platform; evaluate it against a concrete design problem.' },
  { id: 'celus', name: 'CELUS', category: 'electronics', summary: 'Translate functional requirements into circuit blocks and component choices.', url: 'https://www.celus.io/', caution: 'Check component coverage and downstream EDA formats.' },
  { id: 'allspice-drcy', name: 'AllSpice / DRCY', category: 'electronics', summary: 'Hardware revision tracking and AI-assisted design review.', url: 'https://allspice.io/drcy', caution: 'Use alongside deterministic checks and engineering judgment.' },
  { id: 'circuit-world', name: 'Circuit World', category: 'electronics', summary: 'Browse published boards and open-hardware reference designs.', url: 'https://heypcb.ai/world', caution: 'Follow the original board source, license and build documentation.' },
  { id: 'snapmagic', name: 'SnapMagic Search', category: 'electronics', summary: 'Find component symbols, footprints and 3D models.', url: 'https://www.snapeda.com/', caution: 'Verify pin numbering and package dimensions against the datasheet.' },
  { id: 'kicad-cli', name: 'KiCad CLI', category: 'electronics', summary: 'Automate electrical checks, layout checks and design exports.', url: 'https://docs.kicad.org/9.0/en/cli/cli.html', caution: 'This link covers KiCad 9.0; use documentation matching your installed version.' },
  { id: 'ngspice', name: 'ngspice', category: 'electronics', summary: 'Simulate circuits using suitable component models.', url: 'https://ngspice.sourceforge.io/', caution: 'Simulation results depend on the models and assumptions you supply.' },
  { id: 'wokwi', name: 'Wokwi', category: 'electronics', summary: 'Simulate microcontrollers and peripherals for early firmware development.', url: 'https://wokwi.com/' },
  { id: 'zoo', name: 'Zoo Design Studio', category: 'cad', summary: 'Combine prompting, sketching and code for parametric CAD.', url: 'https://zoo.dev/', caution: 'Inspect parameters and geometry; retain editable source as well as exports.' },
  { id: 'fusion', name: 'Autodesk Fusion', category: 'cad', summary: 'Mechanical design and manufacturing workflows with assistant features.', url: 'https://www.autodesk.com/products/fusion-360/overview', caution: 'Check subscription, region and current feature availability.' },
  { id: 'adam', name: 'Adam', category: 'cad', summary: 'A hardware-team copilot for connected engineering tasks.', url: 'https://adam.new/', caution: 'Confirm which advertised integrations are available for your account.' },
  { id: 'cadam', name: 'CADAM', category: 'cad', summary: 'An open-source text-to-CAD application to study or adapt.', url: 'https://github.com/Adam-CAD/CADAM', caution: 'Evaluate separately from the commercial Adam product.' },
  { id: 'cadquery', name: 'CadQuery', category: 'cad', summary: 'Python parametric solid modeling for mounts, fixtures and enclosures.', url: 'https://github.com/CadQuery/cadquery', caution: 'Not itself an AI product; retain scripts as editable design source.' },
  { id: 'openscad', name: 'OpenSCAD', category: 'cad', summary: 'Script-based modeling for configurable printed parts.', url: 'https://openscad.org/' },
  { id: 'blender-mcp', name: 'MCP for Blender', category: 'integrations', summary: 'A community connector for scene editing and inspection.', url: 'https://github.com/ahujasid/mcp-for-blender', caution: 'Not affiliated with Blender Foundation. A convincing mesh does not establish mechanical fit.' },
  { id: 'freecad-mcp', name: 'FreeCAD MCP', category: 'integrations', summary: 'A community connector for model editing and document inspection.', url: 'https://github.com/neka-nat/freecad-mcp', caution: 'Requires FreeCAD, its addon and an MCP server; check compatible versions.' },
  { id: 'fusion-mcp', name: 'Fusion MCP', category: 'integrations', summary: 'Connect AI applications to a local Fusion modeling session.', url: 'https://www.autodesk.com/products/fusion-360/blog/introducing-the-fusion-mcp-opening-fusion-to-ai-powered-workflows/', caution: 'Check current supported operations and account requirements.' },
  { id: 'onshape-mcp', name: 'Onshape MCP', category: 'integrations', summary: 'A community connector for programmatic Onshape modeling.', url: 'https://github.com/borgius/onshape-mcp', caution: 'Evaluate API setup and operation coverage.' },
  { id: 'zoo-mcp', name: 'Zoo MCP', category: 'integrations', summary: 'Expose Zoo CAD tools to external agents and models.', url: 'https://zoo.dev/press/zoo-introduces-zookeeper', caution: 'Check current setup and supported operations in vendor documentation.' },
  { id: 'kicad-mcp', name: 'KiCAD-MCP-Server', category: 'integrations', summary: 'Explore agent access to KiCad and the documented successor route.', url: 'https://github.com/mixelpixx/KiCAD-MCP-Server', caution: 'The source guide notes a move to Konnect; follow the repository’s current instructions.' },
  { id: 'onshape-to-robot', name: 'onshape-to-robot', category: 'simulation', summary: 'Convert CAD assemblies to URDF, SDF and MuJoCo robot descriptions.', url: 'https://github.com/Rhoban/onshape-to-robot', caution: 'Check units, masses, inertia, joint axes and limits after conversion.' },
  { id: 'mujoco-menagerie', name: 'MuJoCo Menagerie', category: 'simulation', summary: 'Robot models for studying joints, collisions and simulation conventions.', url: 'https://github.com/google-deepmind/mujoco_menagerie', caution: 'Confirm model assumptions against the hardware you intend to use.' },
  { id: 'isaac-sim', name: 'Isaac Sim', category: 'simulation', summary: 'Robot simulation and synthetic-data workflows.', url: 'https://developer.nvidia.com/isaac/sim/', caution: 'Check current compute and platform requirements.' },
  { id: 'isaac-lab', name: 'Isaac Lab', category: 'simulation', summary: 'Robot-learning experiments built on Isaac Sim.', url: 'https://developer.nvidia.com/isaac/lab', caution: 'Check compatible Isaac Sim versions and training requirements.' },
  { id: 'arduino-project-hub', name: 'Arduino Project Hub', category: 'projects', summary: 'Browse hardware builds, tutorials and robotics showcases.', url: 'https://projecthub.arduino.cc/' },
  { id: 'hackaday', name: 'Hackaday.io', category: 'projects', summary: 'Community prototypes, experiments and open-hardware build logs.', url: 'https://hackaday.io/projects' },
  { id: 'raspberry-pi-magazine', name: 'Raspberry Pi Official Magazine', category: 'projects', summary: 'Discover maker builds and follow their original creators.', url: 'https://magazine.raspberrypi.com/' },
  { id: 'esp32-tutorials', name: 'Random Nerd Tutorials: ESP32', category: 'projects', summary: 'Practical ESP32 sensor, connectivity and interface projects.', url: 'https://randomnerdtutorials.com/projects-esp32/' },
  { id: 'adafruit', name: 'Adafruit Learning System', category: 'projects', summary: 'Hardware build guides and integration tutorials.', url: 'https://learn.adafruit.com/' },
  { id: 'printables', name: 'Printables', category: 'projects', summary: 'Find printable mechanisms, mounts and enclosures to adapt.', url: 'https://www.printables.com/', caution: 'Check licenses and whether editable CAD is supplied or only a mesh.' },
  { id: 'microduck', name: 'Microduck', category: 'projects', summary: 'Pollen Robotics’ tiny biped and its software documentation.', url: 'https://github.com/pollen-robotics/microduck', caution: 'Inspect hardware and build availability; a repository alone does not establish a complete DIY kit.' },
  { id: 'open-duck-mini', name: 'Open Duck Mini', category: 'projects', summary: 'An expressive walking robot with hardware and build resources.', url: 'https://github.com/apirrone/Open_Duck_Mini', caution: 'Distinct from Microduck. Match hardware revision, servos, runtime and assembly instructions.' },
  { id: 'reachy-mini', name: 'Reachy Mini', category: 'projects', summary: 'An expressive desktop robot for AI interaction experiments.', url: 'https://huggingface.co/docs/reachy_mini/en/index', caution: 'Verify hardware version and app dependencies.' },
  { id: 'so101', name: 'SO-101 build guide', category: 'projects', summary: 'A robot-arm assembly and setup path for LeRobot experiments.', url: 'https://huggingface.co/docs/lerobot/en/so101', caution: 'Match motors, calibration, hardware revision and software instructions.' },
  { id: 'xiaozhi', name: 'Xiaozhi ESP32', category: 'projects', summary: 'An ESP32 conversational-device project for physical AI interfaces.', url: 'https://github.com/78/xiaozhi-esp32', caution: 'Check supported boards, audio hardware and server or model dependencies.' },
]

export const builderProjects: BuilderProject[] = [
  {
    id: 'camera-mount', name: 'Camera mount', summary: 'Make one parameterized mount that fits a measured camera.',
    steps: ['Measure the camera, hole pattern, mounting surface and cable clearance.', 'Model the mount in build123d or CadQuery and retain the editable script.', 'Export STEP and a printable mesh, then prototype and check the physical fit.'],
    checks: 'Check units, screw clearance, minimum wall thickness, print orientation and fit.',
    resourceIds: ['build123d', 'cadquery'],
  },
  {
    id: 'robot-sensor-pod', name: 'Robot sensor pod', summary: 'Read one sensor reliably before designing its custom board and enclosure.',
    steps: ['Plan parts and wiring, then read one sensor on a development board.', 'Create a small KiCad board with one assistant and preserve the firmware and BOM.', 'Design the enclosure and bracket, then record assembly and bring-up results.'],
    checks: 'Check pin assignments, supply levels, connector orientation, mounting clearances and actual readings.',
    resourceIds: ['blueprint', 'copperhead', 'kicad-cli', 'build123d'],
  },
  {
    id: 'pcb-enclosure', name: 'PCB enclosure', summary: 'Derive enclosure mounts and connector openings from board geometry.',
    steps: ['Export a KiCad board and import it into FreeCAD or Fusion without changing its coordinate system.', 'Generate the mounting-hole pattern, standoffs and connector openings.', 'Preserve editable geometry and exports, then inspect fit and assembly conflicts.'],
    checks: 'Check board thickness, component heights, connector access, fasteners and assembly sequence.',
    resourceIds: ['kicad-cli', 'freecad-mcp', 'fusion'],
  },
]
