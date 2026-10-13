import logging
import re
from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior principal systems architect converting spoken architecture thoughts and voice memos into structured, production-grade technical Request for Comments (RFC) documents.

Structure the RFC strictly using the following Markdown sections:
# RFC: <Clear, Descriptive Title>

## Summary
A concise executive summary of the proposal, core objective, and high-level architectural shift.

## Context & Problem Statement
The motivation, existing bottlenecks or failure modes, requirements, and constraints.

## Proposal
The proposed technical design, protocols, data models, workflows, and changes.

## Architecture
Detailed system components, flow of control, and data pipeline.
You MUST include a valid, expressive Mermaid diagram inside a ```mermaid code block illustrating the components, sequence, or flowchart.

## Trade-offs & Alternatives
Considered alternatives, drawbacks, complexity, operational cost, and mitigation strategies.

## Open Questions
Unresolved technical questions, unknowns, migration concerns, or performance benchmarks to conduct.

Ensure the RFC is deeply technical, precise, and actionable. Avoid fluffy prose. Use real systems concepts (e.g. idempotency, failover, consensus, replication, cache invalidation, write buffers)."""

USER_PROMPT_TEMPLATE = """Transform the following transcribed voice recording into a comprehensive technical RFC according to the format:

TRANSCRIPT:
\"\"\"
{transcript}
\"\"\"

Produce the complete RFC markdown with the required sections and a valid ```mermaid code block."""

RETRY_PROMPT_ADDENDUM = "\n\nCRITICAL: In the '## Architecture' section, you MUST include a valid Mermaid diagram inside a ```mermaid``` block."

def extract_title(markdown: str) -> str:
    for line in markdown.splitlines():
        line = line.strip()
        if line.startswith("# RFC:"):
            return line.replace("# RFC:", "").strip()
        if line.startswith("# RFC -"):
            return line.replace("# RFC -", "").strip()
        if line.startswith("# RFC"):
            return line.replace("# RFC", "").strip().lstrip(":- ")
        if line.startswith("# "):
            return line.replace("# ", "").strip()
    return "Technical Proposal"

async def generate_rfc(transcript: str) -> dict:
    """
    Calls Ollama Gemma 2 via OpenAI-compatible API to generate an RFC from a voice transcript.
    Retries once if a mermaid diagram block is missing.
    """
    client = AsyncOpenAI(
        base_url=settings.OLLAMA_BASE_URL,
        api_key="ollama",
        timeout=120.0
    )

    async def call_llm(extra_hint: str = "") -> str:
        prompt = USER_PROMPT_TEMPLATE.format(transcript=transcript) + extra_hint
        response = await client.chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()

    content = await call_llm()

    # Verify if mermaid diagram is included
    if "```mermaid" not in content:
        logger.info("Mermaid block missing from first LLM output. Retrying with explicit hint...")
        try:
            content_retry = await call_llm(extra_hint=RETRY_PROMPT_ADDENDUM)
            if "```mermaid" in content_retry:
                content = content_retry
        except Exception as e:
            logger.warning(f"Retry LLM call failed: {e}")

    title = extract_title(content)
    return {
        "title": title,
        "rfc_markdown": content
    }
