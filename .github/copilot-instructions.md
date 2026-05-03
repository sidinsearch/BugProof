# GitHub Copilot gstack Instructions

This project heavily utilizes the **gstack** AI-assisted development framework. 

When the user requests an action that matches one of the gstack skills (e.g., `/office-hours`, `/review`, `/plan-eng-review`, `/qa`, `/ship`), you must consult the corresponding `SKILL.md` file located in the `.agents/skills/<skill-name>/` directory.

Follow the instructions in the `SKILL.md` file rigorously. Do not invent your own process if a gstack skill applies. 
Always use the **GBrain MCP server** for persistent memory and context when applicable.
