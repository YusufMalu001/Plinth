from pathlib import Path


ROOT = Path("/opt/hermes")
LIMIT_HELPER = '''def _synergy_advisor_max_output_tokens() -> int:
    try:
        configured = int(os.environ.get("INTELLIGENCE_MAX_OUTPUT_TOKENS", "4096"))
    except (TypeError, ValueError):
        return 4096
    return max(1, min(configured, 4096))


'''


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one patch point in {path}, found {count}.")
    path.write_text(source.replace(old, new, 1))


api_server = ROOT / "gateway/platforms/api_server.py"
replace_once(
    api_server,
    "_PROFILE_REJECTED = object()",
    LIMIT_HELPER + "_PROFILE_REJECTED = object()",
)
replace_once(
    api_server,
    "        agent = AIAgent(**agent_kwargs)",
    "        agent_kwargs[\"max_tokens\"] = _synergy_advisor_max_output_tokens()\n"
    "        agent = AIAgent(**agent_kwargs)",
)

transport = ROOT / "agent/transports/chat_completions.py"
replace_once(transport, "import json\nfrom typing", "import json\nimport os\nfrom typing")
replace_once(
    transport,
    "_XAI_TOOL_SEARCH_ALIAS = \"hermes_tool_search\"",
    LIMIT_HELPER + "_XAI_TOOL_SEARCH_ALIAS = \"hermes_tool_search\"",
)
replace_once(
    transport,
    '''def _apply_max_tokens(api_kwargs: dict, model: str, reasoning_config: Any, params: dict, profile_max: Any = None) -> None:
    """Preserve internal task/recovery budgets and provider protocol exceptions."""
    max_tokens_fn = params.get("max_tokens_param_fn")
    for candidate in (params.get("ephemeral_max_output_tokens"), params.get("max_tokens")):
        if candidate is not None and max_tokens_fn:
            api_kwargs.update(max_tokens_fn(_raise_gemini_thinking_max_tokens(model, reasoning_config, candidate)))
            return
    if profile_max and max_tokens_fn:
        api_kwargs.update(max_tokens_fn(_raise_gemini_thinking_max_tokens(model, reasoning_config, profile_max)))
''',
    '''def _apply_max_tokens(api_kwargs: dict, model: str, reasoning_config: Any, params: dict, profile_max: Any = None) -> None:
    """Apply the configured Advisor output cap to normal and retry requests."""
    max_tokens_fn = params.get("max_tokens_param_fn")
    if not max_tokens_fn:
        return
    cap = _synergy_advisor_max_output_tokens()
    candidate = next((value for value in (
        params.get("ephemeral_max_output_tokens"), params.get("max_tokens"), profile_max,
    ) if value is not None), cap)
    try:
        bounded = max(1, min(int(candidate), cap))
    except (TypeError, ValueError):
        bounded = cap
    protocol_tokens = _raise_gemini_thinking_max_tokens(model, reasoning_config, bounded)
    try:
        final_tokens = max(1, min(int(protocol_tokens), cap))
    except (TypeError, ValueError):
        final_tokens = cap
    api_kwargs.update(max_tokens_fn(final_tokens))
''',
)

gemini_adapter = ROOT / "agent/gemini_native_adapter.py"
replace_once(gemini_adapter, "import json\n", "import json\nimport os\n")
replace_once(
    gemini_adapter,
    "GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65535",
    LIMIT_HELPER + "GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = _synergy_advisor_max_output_tokens()",
)
