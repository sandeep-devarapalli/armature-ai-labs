export const resourceCategories = [
  { id: 'all', label: 'All resources' },
  { id: 'electronics', label: 'Electronics & PCB' },
  { id: 'suppliers', label: 'Hardware suppliers' },
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
  kind?: 'supplier' | 'directory' | 'listing'
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
  { id: 'robu', name: 'Robu.in', category: 'suppliers', kind: 'supplier', summary: 'Development boards, sensors, motors, drone parts and prototyping supplies.', url: 'https://robu.in/' },
  { id: 'visha-world', name: 'Visha World', category: 'suppliers', kind: 'supplier', summary: 'Electronic components, soldering equipment, sensors and test instruments.', url: 'https://vishaworld.com/' },
  { id: 'mg-super-labs', name: 'MG Super Labs', category: 'suppliers', kind: 'supplier', summary: 'Robotics kits, depth cameras, development boards and sensors for prototyping.', url: 'https://www.mgsuperlabs.co.in/estore/' },
  { id: 'evelta', name: 'Evelta', category: 'suppliers', kind: 'supplier', summary: 'ICs, passive components, connectors, sensors and development boards.', url: 'https://evelta.com/' },
  { id: 'sunrom', name: 'Sunrom', category: 'suppliers', kind: 'supplier', summary: 'Connectors, switches, embedded modules, components and prototyping hardware.', url: 'https://www.sunrom.com/' },
  { id: 'fabtolab', name: 'Fab.to.Lab', category: 'suppliers', kind: 'supplier', summary: 'Single-board computers, software-defined radios, sensors and robotics hardware.', url: 'https://www.fabtolab.com/' },
  { id: 'thingbits', name: 'Thingbits', category: 'suppliers', kind: 'supplier', summary: 'Raspberry Pi, Arduino, sensors and 3D printers, plus custom 3D printing.', url: 'https://www.thingbits.net/' },
  { id: 'robokits', name: 'Robokits India', category: 'suppliers', kind: 'supplier', summary: 'Motors, drivers, robot kits, mechanical parts and CNC automation hardware.', url: 'https://robokits.co.in/' },
  { id: 'protocentral', name: 'ProtoCentral', category: 'suppliers', kind: 'supplier', summary: 'Open-source biomedical sensor boards, biosignal hardware and development boards.', url: 'https://protocentral.com/' },
  { id: 'hubtronics', name: 'Hubtronics', category: 'suppliers', kind: 'supplier', summary: 'Industrial sensors, electronic components, development boards and test tools.', url: 'https://hubtronics.in/' },
  { id: 'robocraze', name: 'Robocraze', category: 'suppliers', kind: 'supplier', summary: 'AI hardware, development boards, sensors, STEM kits and 3D printing supplies.', url: 'https://robocraze.com/' },
  { id: 'zbotic', name: 'Zbotic', category: 'suppliers', kind: 'supplier', summary: 'Drone parts, motors and sensors, with PCB manufacturing and 3D printing services.', url: 'https://zbotic.in/' },
  { id: 'flyrobo', name: 'FlyRobo', category: 'suppliers', kind: 'supplier', summary: 'Drone kits, flight controllers, motors, batteries and electronics parts.', url: 'https://www.flyrobo.in/' },
  { id: 'roboticsdna', name: 'RoboticsDNA', category: 'suppliers', kind: 'supplier', summary: 'CNC kits, linear actuators, motors, sensors and robotics components.', url: 'https://roboticsdna.in/' },
  { id: 'comkey', name: 'Comkey', category: 'suppliers', kind: 'supplier', summary: 'Component supplier listed in Bengaluru.', url: 'https://www.comkey.in/', caution: 'MakerVille-listed; website certificate warning on 4 October 2026. Current service unconfirmed.' },
  { id: '3dprintronics', name: '3DPrintronics', category: 'suppliers', kind: 'supplier', summary: '3D printers, CNC machines, aluminium extrusions and linear-motion components.', url: 'https://www.3dprintronics.com/' },
  { id: 'teqzo', name: 'TEQZO Consulting', category: 'suppliers', kind: 'supplier', summary: 'Industrial product design, enclosure design and prototyping services.', url: 'https://consulting.teqzo.com/' },
  { id: 'crazypi', name: 'CrazyPi', category: 'suppliers', kind: 'supplier', summary: 'Single-board computers, Raspberry Pi accessories, displays and sensors.', url: 'https://crazypi.com/' },
  { id: 'nex-robotics', name: 'NEX Robotics', category: 'suppliers', kind: 'supplier', summary: 'Research and educational robots, robotic arms, servos and development tools.', url: 'https://www.nex-robotics.com/' },
  { id: 'robomart', name: 'Robomart', category: 'suppliers', kind: 'supplier', summary: 'Electronic components, robot kits, drone parts, sensors and workbench tools.', url: 'https://robomart.com/' },
  { id: 'sumeet-instruments', name: 'Sumeet Instruments', category: 'suppliers', kind: 'supplier', summary: 'Development boards, motors, sensors, robotics kits and laboratory equipment.', url: 'https://sumeetinstruments.com/' },
  { id: 'tanotis', name: 'Tanotis', category: 'suppliers', kind: 'supplier', summary: 'Imported electronic components, tools, optics and imaging equipment.', url: 'https://www.tanotis.com/' },
  { id: 'electron-components', name: 'Electron Components', category: 'suppliers', kind: 'supplier', summary: 'ICs, discrete components, boards, motors and soldering tools.', url: 'https://www.electroncomponents.com/' },
  { id: 'rhydolabz', name: 'rhydoLABZ', category: 'suppliers', kind: 'supplier', summary: 'Embedded development boards, cellular modems, IoT kits and electronic components.', url: 'https://www.rhydolabz.com/' },
  { id: 'potential-labs', name: 'Potential Labs', category: 'suppliers', kind: 'supplier', summary: 'Microcontroller boards, IoT starter kits, sensors and electronic components.', url: 'https://potentiallabs.com/cart/' },
  { id: 'tomson-electronics', name: 'Tomson Electronics', category: 'suppliers', kind: 'supplier', summary: 'Development boards, sensor modules, motor drivers and STEM kits.', url: 'https://www.tomsonelectronics.com/' },
  { id: 'techtonics', name: 'Techtonics', category: 'suppliers', kind: 'supplier', summary: 'Component supplier listed in Ahmedabad.', url: 'https://www.techtonics.in/', caution: 'MakerVille-listed; site access check blocked catalog review on 4 October 2026.' },
  { id: 'probots', name: 'Probots', category: 'suppliers', kind: 'supplier', summary: 'Sensors, enclosures, development boards and robotics parts; PCB and firmware services.', url: 'https://probots.co.in/' },
  { id: 'quadstore', name: 'Quad Store', category: 'suppliers', kind: 'supplier', summary: 'Arduino-compatible kits, Raspberry Pi kits, sensors and robotics learning kits.', url: 'https://quadstore.in/' },
  { id: 'rcbazaar', name: 'RcBazaar', category: 'suppliers', kind: 'supplier', summary: 'RC aircraft, motors, servos, batteries, model-building materials and tools.', url: 'https://rcbazaar.com/default.aspx' },
  { id: 'component-masters', name: 'Component Masters', category: 'suppliers', kind: 'supplier', summary: 'Industrial electronic components, power modules, ICs, relays and rectifiers.', url: 'https://www.componentmasters.co.in/' },
  { id: 'rare-components', name: 'Rare Components', category: 'suppliers', kind: 'supplier', summary: 'Development boards, connectors, displays and industrial communication modules.', url: 'https://rarecomponents.com/' },
  { id: 'campus-component', name: 'Campus Component', category: 'suppliers', kind: 'supplier', summary: 'Electronic component distribution, design support and IoT solutions.', url: 'https://www.campuscomponent.com/' },
  { id: 'elementz', name: 'Elementz', category: 'suppliers', kind: 'supplier', summary: 'Embedded engineering, PCB design, firmware, IoT and instrumentation development.', url: 'https://elementz.dev/' },
  { id: 'rs-components', name: 'RS Components', category: 'suppliers', kind: 'supplier', summary: 'Electronic components, industrial controls, mechanical parts and test equipment.', url: 'https://in.rsdelivers.com/' },
  { id: 'mouser', name: 'Mouser Electronics', category: 'suppliers', kind: 'supplier', summary: 'Electronic components and industrial automation products.', url: 'https://www.mouser.in/' },
  { id: 'lioncircuits', name: 'LionCircuits', category: 'suppliers', kind: 'supplier', summary: 'PCB fabrication, assembly and component sourcing.', url: 'https://www.lioncircuits.com/' },
  { id: 'pcbkingdom', name: 'PCBKingdom', category: 'suppliers', kind: 'supplier', summary: 'PCB manufacturing, assembly and component procurement listed in Pune.', url: 'https://pcbkingdom.com/', caution: 'MakerVille-listed; website certificate warning on 4 October 2026. Current service unconfirmed.' },
  { id: 'misumi', name: 'MISUMI India', category: 'suppliers', kind: 'supplier', summary: 'Configurable mechanical components, linear-motion parts, fasteners and automation hardware.', url: 'https://in.misumi-ec.com/' },
  { id: 'screwwala', name: 'Screwwala', category: 'suppliers', kind: 'supplier', summary: 'Machine screws, nuts, nylon fasteners and spacers from Jay Kay Sales Corporation.', url: 'https://www.screwwala.com/' },
  { id: 'kamla-hardware-mart', name: 'Kamla Hardware Mart', category: 'suppliers', kind: 'listing', summary: 'Hardware store in Surat; MakerVille lists nuts, bolts and screws.', url: 'https://maps.app.goo.gl/fDXe3T5oWGTpYsA9A', caution: 'Google Maps listing; no official website listed. Confirm parts and delivery directly.' },
  { id: 'makenica', name: 'Makenica', category: 'suppliers', kind: 'supplier', summary: 'Custom 3D printing for prototypes and parts using SLA, SLS, FDM and MJF.', url: 'https://makenica.com/' },
  { id: 'case-n-foam', name: 'Case-N-Foam', category: 'suppliers', kind: 'supplier', summary: 'Protective equipment carry cases and custom foam inserts.', url: 'https://caseandfoam.in/' },
  { id: 'pinnacle-cases', name: 'Pinnacle Cases', category: 'suppliers', kind: 'supplier', summary: 'Custom flight cases listed in Mumbai.', url: 'https://www.pinnaclecases.com/', caution: 'MakerVille-listed; website did not resolve on 4 October 2026. Current service unconfirmed.' },
  { id: 'scope-cases', name: 'Scope Cases', category: 'suppliers', kind: 'supplier', summary: 'Instrument enclosures, flight cases, transport cases and demo-kit cases.', url: 'https://www.scopecases.com/' },
  { id: 'phoenix-mecano', name: 'Phoenix Mecano India', category: 'suppliers', kind: 'supplier', summary: 'Industrial and electronic enclosures, automation modules and machine-building components.', url: 'https://www.phoenixmecano.co.in/' },
  { id: 'hatchnhack', name: 'Hatchnhack / HNH Cart', category: 'suppliers', kind: 'supplier', summary: 'Electronic components and electronics manufacturing services listed in Delhi.', url: 'https://www.hnhcart.com/', caution: 'MakerVille-listed; online store displayed unavailable on 4 October 2026. Current service unconfirmed.' },
  { id: 'pcb-power', name: 'PCB Power', category: 'suppliers', kind: 'supplier', summary: 'PCB layout, fabrication, assembly, stencils and component sourcing.', url: 'https://www.pcbpower.com/' },
  { id: 'mech-power', name: 'Mech Power', category: 'suppliers', kind: 'supplier', summary: 'Custom enclosures, CNC machining, sheet-metal fabrication, 3D printing and injection molding.', url: 'https://mechpowertech.com/' },
  { id: 'electronicscomp', name: 'ElectronicsComp', category: 'suppliers', kind: 'supplier', summary: 'Development boards, sensors, components, power supplies and soldering tools.', url: 'https://www.electronicscomp.com/' },
  { id: 'akinfo-tools', name: 'Akinfo Tools', category: 'suppliers', kind: 'supplier', summary: 'Electronics repair tools, soldering equipment, microscopes and multimeters.', url: 'https://akinfotools.com/' },
  { id: 'xcluma', name: 'Xcluma', category: 'suppliers', kind: 'supplier', summary: 'Sensor modules, development boards, 3D-printer parts and robotics components.', url: 'https://www.xcluma.com/' },
  { id: 'eteily', name: 'Eteily', category: 'suppliers', kind: 'supplier', summary: 'RF antennas, connectors, cable assemblies, wireless modules and PCB components.', url: 'https://eteily.com/' },
  { id: 'makerville-vendors', name: 'MakerVille hardware vendor directory', category: 'suppliers', kind: 'directory', summary: 'Community-maintained list of Indian component suppliers, PCB services and fabrication businesses.', url: 'https://wiki.makerville.io/docs/Lists/hardware-vendors/' },
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
