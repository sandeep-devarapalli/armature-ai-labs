# MHS could be physical AI’s MCP moment.

A shared interface could change how builders connect models to machines. The hard part is making those connections dependable.

Armature AI Labs

Published — 13 September 2026

## What Anthropic announced

On 27 August 2026, Anthropic introduced the Model Hardware Standard: a common interface intended to help agents discover and operate physical equipment. Its drivers expose read/write operations and descriptions of device capabilities, characteristics and limits. Agents can reach them through MCP, command-line tools or APIs. Anthropic also describes turning sequences into deterministic code, rather than requiring model reasoning for every operation. [Anthropic’s announcement](https://www.anthropic.com/news/model-hardware-standard-research-preview)

> **Current status:** Limited research preview, with access by application. MHS is not yet a generally available, open-source release. Participants are helping develop evaluations and operating practices before that release. [Official MHS site](https://www.modelhardwarestandard.com/)

Our interest is the possibility of making engineering work reusable across benches, devices and teams—not the promise of a robot that understands everything.

## What MCP taught us

MCP arrived in November 2024 with a specification, SDKs, reference servers and support in Claude Desktop. Developers could try an integration without first inventing its entire communication layer. [MCP launch](https://www.anthropic.com/news/model-context-protocol)

By December 2025, MCP maintainers reported 97 million monthly SDK downloads, 10,000 active servers and support across major AI applications. Those are historical ecosystem figures, not current user counts. [Maintainers’ update](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)

MCP also became a founding project of the Agentic AI Foundation under the Linux Foundation. [Foundation announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)

Our reading is that usefulness and shared ownership reinforced each other. A connector became more valuable when several applications could use it; an application became more useful as compatible connectors accumulated. That is a plausible explanation for momentum, not a controlled study of its causes. Hardware could benefit from a similar pattern, but it has not earned the same conclusion yet.

## From context to physical action

MCP supplies a client-server protocol through which applications discover and use tools, resources and prompts. It does not determine how an application reasons. [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)

MHS is therefore complementary, not a replacement. A useful conceptual stack is an agent reaching an MHS driver through MCP, a CLI or an API, with observations returning from the device. This is an explanatory sketch, not a complete implementation specification. [MHS overview](https://www.anthropic.com/news/model-hardware-standard-research-preview)

Strands is already exploring that connection: its team describes native MHS support as a pre-release mesh backend for preview participants. AWS subsequently confirmed its participation in the limited preview. Neither announcement means that MHS support is generally available. [Strands’ account](https://strandsagents.com/blog/robots-working-together-model-hardware-standard-strands-robots/), [AWS recap](https://aws.amazon.com/blogs/machine-learning/icymi-what-landed-for-ai-builders-in-august-2026/)

The practical question is whether changing one instrument could eventually require a different driver, rather than rewriting the surrounding experiment.

## The opportunity for builders

For makers, the valuable outcome would be a shorter path from an idea to a repeatable experiment. Imagine a small team combining a camera, a positioning stage and a measurement instrument. Today’s working prototype may depend on one person remembering which script, configuration and timing assumption belongs to each component.

A shared interface could make those assumptions easier to describe, inspect and transfer. Another builder might reuse the integration while changing the experiment. A documentation page could travel with a test fixture instead of remaining detached from the system it explains.

That suggests a community opportunity beyond writing drivers. Builders could contribute simulators, test cases, failure records and compatibility notes. Each contribution would make the next integration easier to assess.

This is our thesis, not a report of an established MHS ecosystem. Reuse only helps when the shared component is trustworthy, maintained and clear about its limits. A growing driver directory alone would not demonstrate that.

## A standard is not a safety case

Reading a value and changing the physical world are different responsibilities. An acknowledged command does not prove an intended action happened. A delayed observation may describe a machine that has already moved. Recovery can introduce another change rather than restore the previous state.

Anthropic itself notes limitations in models’ physical reasoning and the continuing need for expert oversight. [Research-preview limits](https://www.anthropic.com/news/model-hardware-standard-research-preview)

For us, a dependable system would need an explicit separation between what an agent may request, what software permits and what the equipment can physically enforce. Its evidence should include unsuccessful runs, interruptions and human interventions—not only a polished demonstration.

We would judge interoperability and operational safety separately. Passing an interface test should not be presented as permission to leave equipment unattended, or as a substitute for a qualified assessment of the complete installation.

## What we would test at Armature

We would begin with a narrowly scoped, supervised evaluation—not a claim that an autonomous lab is ready. The following is a proposed research agenda; it does not imply that Armature has MHS access, a partnership or an existing deployment.

**Can another builder reproduce the integration?** We would record the device configuration, driver revision, dependencies and assumptions, then ask whether a second person can understand the same setup without its original author.

**Does the interface describe reality?** We would examine whether reported state, units, completion signals and unavailable capabilities remain unambiguous. We would want discrepancies recorded, rather than smoothed into a success message.

**Can failure be understood?** We would evaluate how the system reports interruptions, rejects unsupported requests and distinguishes a proposed recovery from an authorized action. The evidence must show where human judgment remains necessary.

**Is reuse actually cheaper?** We would compare integration effort, maintenance work and reproducibility across a small set of configurations. A shorter first demo is useful; a second team’s successful repeat would be more persuasive.

## The next interface layer

We think shared hardware interfaces could become important infrastructure for embodied intelligence. They could let improvements in models, devices and experimental practice reinforce one another instead of remaining isolated projects.

MHS is a credible direction to investigate, not a guaranteed winner. Its eventual importance will depend on public specifications, usable implementations, cross-vendor participation and evidence that survives outside the original demonstrations.

The MCP parallel is a question worth asking: can a common interface make a builder’s work useful to many more people? For physical AI, the answer will also depend on whether those people can understand its behaviour, inspect its limits and reproduce its results. That is the standard of progress we would want to help establish.

## References

1. [Anthropic — Previewing the Model Hardware Standard](https://www.anthropic.com/news/model-hardware-standard-research-preview)
2. [Model Hardware Standard — Official research-preview site](https://www.modelhardwarestandard.com/)
3. [Strands — Robots working together with MHS](https://strandsagents.com/blog/robots-working-together-model-hardware-standard-strands-robots/)
4. [AWS — What landed for AI builders in August 2026](https://aws.amazon.com/blogs/machine-learning/icymi-what-landed-for-ai-builders-in-august-2026/)
5. [Anthropic — Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)
6. [MCP — Architecture overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)
7. [MCP — Joining the Agentic AI Foundation](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)
8. [Linux Foundation — Formation of the Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
