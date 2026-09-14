#!/usr/bin/env python3
"""learn-engine backend — real model calls, grounded in the atom library.

Endpoints
  GET  /api/health          engine state: atom count, model, whether the key works
  POST /api/ask             tutor answer, grounded in retrieved atoms, EN or zh-Hant
  POST /api/explain         explain one atom at a chosen level and language
  POST /api/quiz            generate a practice set from a scope (unit / atom / outcome)
  POST /api/grade           grade a free-text answer against the atom's own content
  POST /api/teach           W0 teaching: derivation with prediction pauses, depth by salience
  POST /api/frame           one framework per unit: shape, nodes, edges, gaps, two-pass plan
  POST /api/frame_grade     grade a framework reproduced from memory

Every response carries `atoms_used` so nothing the model says is unattributable.

Backend selection (auto-detected in order):
  1. ANTHROPIC_API_KEY → Claude (paid, highest quality)
  2. GEMINI_API_KEY → Google Gemini (free tier, 15 RPM)
  3. GROQ_API_KEY → Groq (free tier, runs Llama/DeepSeek, very fast)
  4. OPENROUTER_API_KEY → OpenRouter (free models available, many providers)
  5. Ollama running locally → local models (completely free)
  6. None of the above → mock mode with pre-written responses
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
ATOMS_PATH = DATA_DIR / "atoms.json"

# Model configuration per backend
MODELS = {
    "anthropic": {"main": "claude_sonnet_4_6", "fast": "claude_haiku_4_5"},
    "gemini": {"main": "gemini-2.5-flash", "fast": "gemini-2.0-flash"},
    "groq": {"main": "llama-3.3-70b-versatile", "fast": "llama-3.1-8b-instant"},
    "openrouter": {"main": "inclusionai/ling-3.0-flash-vl:free", "fast": "inclusionai/ling-3.0-flash-vl:free"},
    "ollama": {"main": os.environ.get("OLLAMA_MODEL", "llama3"), "fast": os.environ.get("OLLAMA_MODEL", "llama3")},
}
MODEL_MAIN = os.environ.get("MODEL_MAIN", "")  # Set per backend
MODEL_FAST = os.environ.get("MODEL_FAST", "")  # Set per backend
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

def _ollama_available() -> bool:
    """Check if Ollama is running locally."""
    try:
        import urllib.request
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=2)
        return True
    except Exception:
        return False

# Backend selection - auto-detect available API keys
BACKEND = "mock"
MODEL_MAIN = MODELS["mock"]["main"] if "mock" in MODELS else "mock"
MODEL_FAST = MODELS["mock"]["fast"] if "mock" in MODELS else "mock"

# Initialize clients
anthropic_client = None
gemini_client = None
groq_client = None
openrouter_client = None

if os.environ.get("ANTHROPIC_API_KEY"):
    try:
        from anthropic import Anthropic
        anthropic_client = Anthropic()
        BACKEND = "anthropic"
    except Exception:
        pass

if not BACKEND or BACKEND == "mock":
    if os.environ.get("GEMINI_API_KEY"):
        try:
            import google.generativeai as genai
            genai.configure(api_key=os.environ["GEMINI_API_KEY"])
            gemini_client = genai
            BACKEND = "gemini"
        except Exception:
            pass

if not BACKEND or BACKEND == "mock":
    if os.environ.get("GROQ_API_KEY"):
        try:
            from groq import Groq
            groq_client = Groq()
            BACKEND = "groq"
        except Exception:
            pass

if not BACKEND or BACKEND == "mock":
    if os.environ.get("OPENROUTER_API_KEY"):
        try:
            from openai import OpenAI
            openrouter_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=os.environ["OPENROUTER_API_KEY"]
            )
            BACKEND = "openrouter"
        except Exception:
            pass

if not BACKEND or BACKEND == "mock":
    if _ollama_available():
        BACKEND = "ollama"

# Set models based on detected backend
if BACKEND in MODELS:
    MODEL_MAIN = os.environ.get("MODEL_MAIN", MODELS[BACKEND]["main"])
    MODEL_FAST = os.environ.get("MODEL_FAST", MODELS[BACKEND]["fast"])

STOP = set("""the and not for with that into from only its all one two are has have must
because than rather every each which when where what how can does their they them this
these those over under same different more less but also been being was were will would
should could may might your our why a an of to in on at by as is be so if no yes you we
i my it""".split())


def load_atoms() -> list[dict]:
    with ATOMS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[A-Za-z]{3,}", text.lower()) if w not in STOP} | \
           {text[i:i + 2] for i in range(len(text) - 1) if "\u4e00" <= text[i] <= "\u9fa5"}


def retrieve(query: str, atoms: list[dict], k: int = 5) -> list[dict]:
    """Keyword retrieval over title + quote + premises. Deliberately simple and
    inspectable: the frontend shows exactly which atoms fed the answer."""
    q = terms(query)
    if not q:
        return atoms[:k]
    scored = []
    for a in atoms:
        blob = " ".join([a["title"], a["source_quote"], " ".join(a["irreducible_premises"]),
                         " ".join(a["derivation_chain"])])
        overlap = len(q & terms(blob)) / len(q)
        title_hit = len(q & terms(a["title"])) / len(q)      # title match weighs most
        scored.append((overlap + 1.5 * title_hit + a["salience"] / 200, a))
    scored.sort(key=lambda t: -t[0])
    return [a for s, a in scored[:k] if s > 0.02] or [scored[0][1]]


def atom_block(a: dict) -> str:
    return (f"[{a['id']}] {a['title']}\n"
            f"source: {a['source_name']}\n"
            f"verbatim quote: {a['source_quote']}\n"
            f"irreducible premises: {' | '.join(a['irreducible_premises'])}\n"
            f"derivation chain: {' -> '.join(a['derivation_chain'])}\n"
            f"assumptions: {' | '.join(a['assumptions'])}\n"
            f"failure modes: {' | '.join(a['failure_modes'])}")


LANG_RULE = {
    "en": "Answer in BOTH English and Traditional Chinese. For each paragraph of explanation, "
          "write the English version first, then the Chinese version below it, separated by a "
          "blank line. Technical terms should appear in English with the Chinese term in "
          "parentheses on first mention, e.g. total probability theorem（全機率定理）. "
          "Use \\[EN\\] and \\[ZH\\] markers to separate the two language sections of each response.",
    "zh": "Answer in BOTH Traditional Chinese and English. For each paragraph of explanation, "
          "write the Chinese version first, then the English version below it, separated by a "
          "blank line. Technical terms should appear in English with the Chinese term in "
          "parentheses on first mention, e.g. total probability theorem（全機率定理）. "
          "Use \\[ZH\\] and \\[EN\\] markers to separate the two language sections of each response.",
}

TUTOR_SYSTEM = """You are the tutor inside a first-principles learning system for MITx \
6.431x Probability. The user is a beginner — assume they have never seen this material before. \
Your job is to make every concept feel concrete and intuitive, not abstract and theoretical.

Rules you must follow:
1. Ground the answer in the ATOM LIBRARY supplied below whenever it is relevant. \
Do NOT show atom ids (like [A0001]) to the user — they are for internal tracking only. \
If the library does not cover the question, say so explicitly in one sentence, then answer \
from standard probability theory and mark that part as "outside the library".
2. Never give a formula without the reason it takes that form. State the irreducible \
premises first, then the derivation, then the boundary where it fails.
3. Name at least one failure mode or assumption whenever you state a result.
4. Do not flatter, do not pad, do not summarise the question back to the user.
5. If the user's question contains a misconception, correct it in the first sentence.
6. %s
7. Use \\( \\) for inline math and \\[ \\] for display math. Keep the answer under 350 words \
unless the user asks for a derivation, in which case show every step.
8. EVERYDAY EXAMPLE: After explaining the concept, give ONE concrete example from daily life \
that a Hong Kong adult would encounter — MTR delays, food delivery times, phone battery, \
weather forecasts, queues, medical tests, sports results. The example must illustrate the \
concept, not just mention it. Walk through the numbers so the user sees how the formula \
applies to their world.
9. BEGINNER TONE: Write as if explaining to a smart friend who is meeting this idea for the \
first time. Avoid jargon where a plain word works. When you must use a technical term, \
define it in the same sentence. Never assume the user knows notation — explain every symbol.
10. BILINGUAL FORMAT: Structure your response with \\[EN\\] and \\[ZH\\] section markers. \
Write the full answer in one language under \\[EN\\], then write the complete translation \
under \\[ZH\\]. Both sections must cover the same content — same examples, same formulas, \
same failure modes. Do not skip or summarise in either section."""


class Ask(BaseModel):
    question: str
    lang: str = "en"
    history: list[dict] = []


class Explain(BaseModel):
    atom_id: str
    lang: str = "zh"
    level: str = "twelve"      # twelve | peer | exam


class Quiz(BaseModel):
    scope: str = "unit"        # unit | atom | outcome
    value: str = "2"
    count: int = 4
    lang: str = "en"
    difficulty: str = "exam"   # recall | exam | transfer


class Grade(BaseModel):
    atom_id: str
    question: str
    expected: list[str] = []
    answer: str
    lang: str = "en"


def call(model: str, system: str, user: str, max_tokens: int = 1600) -> str:
    """Call the AI backend. Auto-routes to detected provider."""
    result = None
    if BACKEND == "anthropic" and anthropic_client:
        msg = anthropic_client.messages.create(model=model, max_tokens=max_tokens, system=system,
                                     messages=[{"role": "user", "content": user}])
        result = "".join(b.text for b in msg.content if b.type == "text")
    elif BACKEND == "gemini" and gemini_client:
        result = _call_gemini(model, system, user, max_tokens)
    elif BACKEND == "groq" and groq_client:
        result = _call_groq(model, system, user, max_tokens)
    elif BACKEND == "openrouter" and openrouter_client:
        result = _call_openrouter(model, system, user, max_tokens)
    elif BACKEND == "ollama":
        result = _call_ollama(model, system, user, max_tokens)
    
    # Safety: never return None
    if not result:
        result = _mock_response(system, user, max_tokens)
    return result


def _call_gemini(model: str, system: str, user: str, max_tokens: int = 1600) -> str:
    """Call Google Gemini API."""
    genai = gemini_client
    gemini_model = genai.GenerativeModel(model, system_instruction=system)
    response = gemini_model.generate_content(user, generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens))
    return response.text


def _call_groq(model: str, system: str, user: str, max_tokens: int = 1600) -> str:
    """Call Groq API (free tier, runs Llama/DeepSeek)."""
    completion = groq_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        max_tokens=max_tokens,
        temperature=0.7
    )
    return completion.choices[0].message.content


def _call_openrouter(model: str, system: str, user: str, max_tokens: int = 1600) -> str:
    """Call OpenRouter API (supports many free models). Falls back to mock on rate limit."""
    try:
        completion = openrouter_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            max_tokens=max_tokens,
            temperature=0.7
        )
        return completion.choices[0].message.content
    except Exception as e:
        # Rate limit or other error - fall back to mock
        print(f"OpenRouter error, falling back to mock: {e}")
        return _mock_response(system, user, max_tokens)


def _call_ollama(model: str, system: str, user: str, max_tokens: int = 1600) -> str:
    """Call local Ollama instance."""
    import urllib.request
    payload = json.dumps({
        "model": model,
        "system": system,
        "prompt": user,
        "stream": False,
        "options": {"num_predict": max_tokens}
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
        return result.get("response", "")


def _mock_response(system: str, user: str, max_tokens: int = 1600) -> str:
    """Return a realistic mock response for UI testing."""
    # Detect which endpoint this is for based on system prompt content
    if "You are the tutor" in system:
        return """[EN]
The total probability theorem helps you find the overall chance of something happening when there are multiple possible causes.

**The idea in plain words**: If an event can happen through several different paths, the total probability is the sum of (how likely each path is) times (how likely the event is given that path).

**Everyday example — MTR delays**:
Imagine your MTR ride can be delayed by three causes:
- Signal failure: happens 5% of days, and when it does, causes delays 80% of the time
- Bad weather: happens 20% of days, causes delays 30% of the time
- Everything else: happens 75% of days, causes delays 5% of the time

Your overall chance of delay = (0.05 × 0.80) + (0.20 × 0.30) + (0.75 × 0.05) = 0.04 + 0.06 + 0.0375 = **13.75%**

Notice we weight each cause by how often it occurs — signal failure is rare (5%) so it contributes little even though it almost always causes delays when it happens.

**When this fails**: If your list of causes misses a scenario (not exhaustive), you underestimate the total. If two causes can happen together (not mutually exclusive), you double-count the overlap.

*Mock response.*

[ZH]
全機率定理（total probability theorem）幫你在有多個可能原因時，計算某件事發生的總機率。

**白話解釋**：如果一個事件可以透過幾條不同路徑發生，總機率就是每條路徑的（發生機率）乘以（在該路徑下事件發生的機率）的總和。

**生活例子——港鐵延誤**：
假設你的港鐵班次可能因三個原因延誤：
- 信號故障：5% 的日子會發生，發生時 80% 會導致延誤
- 惡劣天氣：20% 的日子會發生，發生時 30% 會導致延誤
- 其他原因：75% 的日子，發生時 5% 會導致延誤

你的總延誤機率 = (0.05 × 0.80) + (0.20 × 0.30) + (0.75 × 0.05) = 0.04 + 0.06 + 0.0375 = **13.75%**

注意我們用每個原因的發生頻率來加權——信號故障很罕見（5%），所以即使它幾乎每次都會導致延誤，貢獻仍然很小。

**何時會出錯**：如果你的原因清單遺漏了某種情況（不窮盡），你會低估總機率。如果兩個原因可能同時發生（不互斥），你會重複計算重疊部分。

*模擬回應。*"""
    
    if "You explain one knowledge atom" in system:
        return """**Total Probability Theorem** explained simply:

Imagine you want to know the chance of rain tomorrow. You can't just guess — you break it into cases: what if a cold front comes? What if it doesn't?

The theorem says: if you split all possibilities into non-overlapping cases that cover everything, the overall probability is the weighted average of the probability in each case.

**Boundary**: This only works when your cases don't overlap and don't miss anything. If you forget a case, your answer is too low.

*Note: This is a mock response. Set ANTHROPIC_API_KEY or install Ollama for live AI.*"""
    
    if "You generate practice questions" in system:
        return json.dumps([
            {
                "atom_id": "A0001",
                "type": "recall",
                "prompt": "State the total probability theorem and list all its premises.",
                "expected": ["Partition must be mutually exclusive", "Partition must be exhaustive", "P(Ai) > 0 for all i", "Formula: P(B) = Σ P(Ai)P(B|Ai)"],
                "trap": "Forgetting that P(Ai) > 0 is required for the conditional to be defined"
            },
            {
                "atom_id": "A0001",
                "type": "boundary",
                "prompt": "What happens if two of your partition events overlap? Give a concrete example.",
                "expected": ["Overlap causes double-counting", "Sum can exceed 1", "Example with weather events"],
                "trap": "Thinking overlap just makes the answer slightly wrong rather than fundamentally invalid"
            }
        ], ensure_ascii=False)
    
    if "You grade one answer" in system:
        return json.dumps({
            "score": 2.5,
            "hit": ["Recognized that the pieces do not overlap"],
            "missed": ["Did not name the premise: the Aᵢ are mutually exclusive (Aᵢ ∩ Aⱼ =  for i ≠ j)",
                       "Did not show the chain: (B ∩ Aᵢ) ∩ (B ∩ Aⱼ) = B ∩ (Aᵢ ∩ Aⱼ) = B ∩ ∅ = "],
            "wrong": ["\"not overlap\" is informal — the precise term is \"mutually exclusive\" or \"disjoint\", and the reason is the partition premise, not an observation"],
            "next_probe": "If A₁ and A₂ are mutually exclusive, what is A₁ ∩ A₂? Now substitute that into (B  A₁) ∩ (B ∩ A₂) and simplify.",
            "verdict": "The intuition is right but the answer does not cite the partition premise or show the set-algebra step that makes it a proof rather than an observation."
        }, ensure_ascii=False)
    
    if "You teach ONE knowledge atom" in system:
        return json.dumps({
            "everyday_en": "You're checking whether your MTR will be delayed. There are three causes: signal failure (5% chance, causes 80% of delays), weather (20% chance, causes 30% of delays), and everything else (75% chance, causes 5% of delays). What's your overall chance of delay?",
                        "everyday_zh": "你正在檢查港鐵（MTR）是否會延誤。延誤有三個原因：信號故障（發生機率 5%，導致 80% 的延誤）、天氣（發生機率 20%，導致 30% 的延誤），以及其他原因（發生機率 75%，導致 5% 的延誤）。你遇到延誤的總機率是多少？",
            "primer": [
                {"term_en": "Sample space", "term_zh": "樣本空間", "plain_en": "The set of all possible outcomes of an experiment.", "plain_zh": "一個實驗所有可能結果的集合。", "everyday_en": "Every day the MTR is either on time or delayed.", "everyday_zh": "每天港鐵要么準時，要么延誤。", "notation": "Ω"},
                {"term_en": "Event", "term_zh": "事件", "plain_en": "A subset of outcomes we care about.", "plain_zh": "我們關心的結果子集。", "everyday_en": "The event B = \"MTR is delayed today\".", "everyday_zh": "事件 B =「今天港鐵延誤」。", "notation": "B, A₁, A₂, …"},
                {"term_en": "Probability", "term_zh": "概率", "plain_en": "A number between 0 and 1 measuring how likely an event is.", "plain_zh": "一個介於 0 和 1 之間的數，衡量事件發生的可能性。", "everyday_en": "P(delay) = 0.1375 means about a 14% chance.", "everyday_zh": "P(延誤) = 0.1375 表示大約 14% 的機率。", "notation": "P(A)"},
                {"term_en": "Mutually exclusive", "term_zh": "互斥", "plain_en": "Two events that cannot happen at the same time.", "plain_zh": "兩個不可能同時發生的事件。", "everyday_en": "Signal failure and weather as separate causes don't overlap in our model.", "everyday_zh": "在我們的模型中，信號故障和天氣作為獨立原因不會重疊。", "notation": "Aᵢ ∩ Aⱼ = ∅"},
                {"term_en": "Partition", "term_zh": "劃分", "plain_en": "A set of mutually exclusive events that together cover every possible outcome.", "plain_zh": "一組互斥事件，合起來涵蓋所有可能結果。", "everyday_en": "The three delay causes: signal, weather, other — no overlap, nothing missing.", "everyday_zh": "三個延誤原因：信號、天氣、其他——不重疊、不遺漏。", "notation": "A₁, A₂, …, Aₙ"},
                {"term_en": "Conditional probability", "term_zh": "條件概率", "plain_en": "The chance of something happening given that we're already in a specific case.", "plain_zh": "在已知處於某個特定情況下的發生機率。", "everyday_en": "Chance of delay given signal failure = 80%.", "everyday_zh": "已知信號故障時延誤的機率 = 80%。", "notation": "P(B|Aᵢ)"}
            ],
            "why_it_exists_en": "Without this theorem, you'd have to measure the overall probability directly, which is often impossible. It lets you compute a hard probability from easier conditional ones.",
            "why_it_exists_zh": "沒有這個定理，你就必須直接測量整體概率，而這通常是不可能的。它讓你能從較容易的條件概率計算出困難的概率。",
            "trap_en": "Averaging the conditional probabilities with equal weights instead of weighting by P(A). The unweighted average of 80%, 30%, 5% is 38.3%, but the correct answer is 0.05×0.80 + 0.20×0.30 + 0.75×0.05 = 13.75%.",
            "trap_zh": "用等權重平均條件概率，而不是按 P(A) 加權。80%、30%、5% 的未加權平均是 38.3%，但正確答案是 0.05×0.80 + 0.20×0.30 + 0.75×0.05 = 13.75%。",
            "steps": [
                {"claim_en": "Decompose B using the partition", "claim_zh": "用劃分分解 B", "uses": "Partition is exhaustive: ∪Aᵢ = Ω", "body_en": "B = B ∩ Ω = B ∩ (∪Aᵢ) = ∪(B ∩ Aᵢ)", "body_zh": "B = B ∩ Ω = B ∩ (∪Aᵢ) = ∪(B ∩ Aᵢ)，即將 B 拆成各劃分塊與 B 的交集。", "concrete_en": "A delay must come from one of the three causes.", "concrete_zh": "延誤必定來自三個原因之一。", "predict": "Why are the pieces B ∩ A disjoint?", "answer": "Because the Aᵢ are mutually exclusive, so (B  Aᵢ) ∩ (B ∩ Aⱼ) = B ∩ (Aᵢ ∩ Aⱼ) = B ∩ ∅ = ∅."},
                {"claim_en": "Apply additivity", "claim_zh": "應用可加性", "uses": "Finite additivity axiom", "body_en": "P(B) = P(∪(B ∩ Aᵢ)) = Σ P(B ∩ A)", "concrete_en": "Overall delay probability = sum of delay probabilities from each cause.", "concrete_zh": "總延誤概率 = 每個原因造成的延誤概率之和。", "predict": "What's P(B ∩ A₁) for the signal failure case?", "answer": "P(B ∩ A₁) = P(A₁)P(B|A₁) = 0.05 × 0.80 = 0.04."},
                {"claim_en": "Apply multiplication rule", "claim_zh": "應用乘法定律", "uses": "P(A ∩ B) = P(A)P(B|A)", "body_en": "P(B ∩ Aᵢ) = P(Aᵢ)P(B|Aᵢ), so P(B) = Σ P(Aᵢ)P(B|A)", "body_zh": "P(B  A) = P(Aᵢ)P(B|A)，因此 P(B) = Σ P(Aᵢ)P(B|A)。", "concrete_en": "Weight each cause's delay rate by how likely that cause is.", "concrete_zh": "用每個原因的發生機率加權其延誤率。", "predict": "Compute the final answer.", "answer": "0.05×0.80 + 0.20×0.30 + 0.75×0.05 = 0.04 + 0.06 + 0.0375 = 0.1375 = 13.75%."}
            ],
            "boundary": {"change_en": "Remove the mutual exclusivity requirement", "change_zh": "移除互斥性要求", "consequence_en": "If signal failure and weather can happen together, the overlap is counted twice and the sum overstates the true delay probability.", "consequence_zh": "如果信號故障和天氣可能同時發生，重疊部分會被計算兩次，總和會高估真實的延誤概率。"},
            "numeric": {"setup": "P(A₁)=0.05, P(B|A₁)=0.80; P(A₂)=0.20, P(B|A₂)=0.30; P(A₃)=0.75, P(B|A₃)=0.05", "result": "P(B) = 0.05×0.80 + 0.20×0.30 + 0.75×0.05 = 0.04 + 0.06 + 0.0375 = 0.1375"},
            "closing_prompt": "In one sentence, why does the total probability theorem let you compute something hard from things that are easier to measure?"
        }, ensure_ascii=False)
    
    if "You build ONE framework" in system:
        return json.dumps({
            "shape": "reference",
            "shape_reason": "Probability theory has a standard logical structure: axioms → conditioning → independence → counting. A why-chain would force artificial dependencies; timeline and process don't fit mathematical content.",
            "core_question": "How do we compute the probability of complex events from simple building blocks?",
            "nodes": [
                {"id": "N1", "label": "Probability axioms", "claim": "Nonnegativity, normalization, additivity define what probability is.", "atoms": ["A0001"], "gap": false, "missing": ""},
                {"id": "N2", "label": "Conditional probability", "claim": "P(A|B) = P(A∩B)/P(B) updates beliefs given evidence.", "atoms": ["A0002"], "gap": false, "missing": ""},
                {"id": "N3", "label": "Total probability theorem", "claim": "Decompose hard probabilities into weighted sums of conditional ones.", "atoms": ["A0001"], "gap": false, "missing": ""},
                {"id": "N4", "label": "Independence", "claim": "P(A∩B) = P(A)P(B) when events don't influence each other.", "atoms": ["A0003"], "gap": false, "missing": ""},
                {"id": "N5", "label": "Bayes' rule", "claim": "Invert conditional probabilities to infer causes from effects.", "atoms": ["A0004"], "gap": false, "missing": ""}
            ],
            "edges": [
                {"from": "N1", "to": "N2", "why": "Conditional probability is defined using the axioms"},
                {"from": "N2", "to": "N3", "why": "Total probability uses conditional probabilities"},
                {"from": "N3", "to": "N5", "why": "Bayes' rule applies total probability in the denominator"},
                {"from": "N1", "to": "N4", "why": "Independence is defined as a special case of the multiplication rule"}
            ],
            "process_steps": [],
            "two_pass": {
                "pass1": "Notice the dependency chain: axioms enable conditioning, which enables total probability, which enables Bayes. Independence is a parallel branch.",
                "pass2": "Summarise as: from three axioms, derive conditioning, then decomposition (total probability), then inversion (Bayes), with independence as a simplifying assumption."
            },
            "recall_prompt": "Draw the five nodes and their dependencies from memory. Name the core question the unit answers."
        }, ensure_ascii=False)
    
    if "You compare a framework" in system:
        return json.dumps({
            "score": 3.5,
            "nodes_hit": ["Probability axioms", "Conditional probability", "Total probability theorem"],
            "nodes_missed": ["Independence", "Bayes' rule"],
            "edges_wrong": ["Stated Bayes' rule depends on independence — it actually depends on total probability"],
            "extra": ["Added 'law of large numbers' which is correct but belongs to a later unit"],
            "verdict": "Core chain is solid but the later nodes are missing; the independence/Bayes confusion suggests the dependency structure isn't fully internalised.",
            "next_probe": "Explain why Bayes' rule needs total probability in its denominator — what would break if you removed it?"
        }, ensure_ascii=False)
    
    # Default fallback
    return "This is a mock response for UI testing. Set ANTHROPIC_API_KEY or install Ollama for live AI responses."


def as_json(text: str) -> dict | list:
    t = text.strip()
    # Remove markdown code fences
    if t.startswith("```"):
        t = re.sub(r"^```[a-z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    # Find the first { or [ and extract JSON from there
    start = min([i for i in (t.find("{"), t.find("[")) if i != -1] or [0])
    # Find the matching closing bracket
    bracket = t[start]
    end = t.rfind("}" if bracket == "{" else "]") + 1
    if end <= start:
        end = len(t)
    return json.loads(t[start:end])


@app.get("/api/health")
def health():
    atoms = load_atoms()
    try:
        call(MODEL_FAST, "Reply with the single word ready.", "ready?", max_tokens=16)
        live = True
        err = None
    except Exception as e:                                   # noqa: BLE001
        live, err = False, str(e)[:200]
    return {"atoms": len(atoms), "model": MODEL_MAIN, "live": live, "error": err,
            "needs_confirm": sum(1 for a in atoms if a["needs_human_confirm"]),
            "backend": BACKEND}


@app.post("/api/ask")
def ask(q: Ask):
    atoms = load_atoms()
    hits = retrieve(q.question, atoms, 5)
    library = "\n\n".join(atom_block(a) for a in hits)
    convo = "".join(f"\n{h['role'].upper()}: {h['text']}" for h in q.history[-6:])
    user = (f"ATOM LIBRARY (the user's own extracted atoms, all from their course "
            f"materials):\n\n{library}\n\nPREVIOUS TURNS:{convo or ' none'}\n\n"
            f"QUESTION: {q.question}")
    text = call(MODEL_MAIN, TUTOR_SYSTEM % LANG_RULE.get(q.lang, LANG_RULE["en"]), user)
    return {"answer": text, "atoms_used": [{"id": a["id"], "title": a["title"]} for a in hits],
            "model": MODEL_MAIN}


LEVEL = {
    "twelve": "Explain it to a bright twelve-year-old: concrete objects, no notation, one "
              "analogy, and state where the analogy breaks.",
    "peer": "Explain it to a classmate who knows calculus but not this result.",
    "exam": "Explain it the way you would need to write it in an exam: premises, "
            "derivation, and the condition whose removal breaks it.",
}


@app.post("/api/explain")
def explain(e: Explain):
    atoms = load_atoms()
    a = next((x for x in atoms if x["id"] == e.atom_id), None)
    if not a:
        return {"error": f"atom {e.atom_id} not found"}
    system = ("You explain one knowledge atom from a first-principles learning system. "
              + LEVEL.get(e.level, LEVEL["exam"]) + " "
              + LANG_RULE.get(e.lang, LANG_RULE["zh"])
              + " Never add material that is not derivable from the atom given. End with "
                "one line beginning 'Boundary:' naming the condition that breaks it.")
    text = call(MODEL_FAST, system, atom_block(a), max_tokens=900)
    return {"explanation": text, "atoms_used": [{"id": a["id"], "title": a["title"]}]}


class WhyChain(BaseModel):
    atom_id: str
    premise: str
    depth: int = 3
    lang: str = "en"


WHY_CHAIN_SYSTEM = """You generate a "Why?" drill-down chain for a first-principles \
learning system. Given a premise, you answer "Why is this true?" up to `depth` levels deep.

Rules:
1. Each level answers the previous level's "Why?" question.
2. Stop when you reach an axiom, definition, or "this is defined this way".
3. Use plain language, not jargon.
4. Answer in the same language as the request.
5. Return ONLY JSON (no markdown code fences):
{"chain": [{"level": 1, "question": "Why is [premise] true?", "answer": "because..."},
           {"level": 2, "question": "Why is that?", "answer": "because..."},
           ...]}"""


@app.post("/api/why_chain")
def why_chain(w: WhyChain):
    atom = ATOMS_BY_ID.get(w.atom_id)
    if not atom:
        return {"error": "atom not found"}
    context = json.dumps({
        "atom_id": atom["id"],
        "title": atom["title"],
        "premise": w.premise,
        "depth": w.depth
    }, ensure_ascii=False, indent=1)
    try:
        text = call(MODEL_FAST, WHY_CHAIN_SYSTEM % LANG_RULES.get(w.lang, ""),
                    context, max_tokens=800)
        result = as_json(text)
        return {"chain": result.get("chain", []), "model": MODEL_FAST}
    except Exception as e:
        return {"error": str(e), "raw": text[:400] if 'text' in dir() else ""}


DIFF = {
    "recall": "Questions should test whether the premises and derivation can be "
              "reproduced without notes.",
    "exam": "Questions should match the difficulty of an MITx 6.431x problem set: a "
            "concrete setup with numbers where a formula must be selected and justified.",
    "transfer": "Questions must move the principle into a domain the user works in "
                "(enterprise cloud sales, account renewal rates, funnel conversion, "
                "reliability of a service) and require naming where the transfer fails.",
}

QUIZ_SYSTEM = """You generate practice questions for a first-principles learning system. \
Build them ONLY from the atoms supplied — every question must be answerable from the \
premises, derivation, assumptions and failure modes given, and each question must name \
the atom it came from.

%s %s

Mix the question types across the set, drawing from: free recall of the derivation, \
boundary probe (what breaks if one premise is removed), error hunt (present a wrong \
argument the user must diagnose), numeric application, and transfer.

At least one question in every set must be set in an ordinary situation from daily life \
\u2014 weather, transit delays, deliveries, medical tests, queues, phone batteries, sports \
results \u2014 stated with no notation, so the learner has to recognise the structure before \
applying it. Textbook urns, dice and coins do not count as everyday situations.

Return ONLY a JSON array. Each element:
{"atom_id": "A0001", "type": "boundary|recall|error_hunt|numeric|transfer",
 "prompt": "the question shown to the user",
 "expected": ["3-5 key points a correct answer must contain"],
 "trap": "the specific mistake this question is designed to catch"}"""


@app.post("/api/quiz")
def quiz(q: Quiz):
    atoms = load_atoms()
    if q.scope == "atom":
        pool = [a for a in atoms if a["id"] == q.value]
    elif q.scope == "unit":
        pool = [a for a in atoms if re.search(rf"Unit {q.value}\b", a["source_name"])]
    else:
        pool = retrieve(q.value, atoms, 6)
    pool = sorted(pool, key=lambda a: -a["salience"])[:6]
    if not pool:
        return {"error": "no atoms in that scope", "items": []}
    library = "\n\n".join(atom_block(a) for a in pool)
    system = QUIZ_SYSTEM % (DIFF.get(q.difficulty, DIFF["exam"]),
                            LANG_RULE.get(q.lang, LANG_RULE["en"]))
    text = call(MODEL_MAIN, system,
                f"ATOMS:\n\n{library}\n\nGenerate exactly {q.count} questions.",
                max_tokens=2600)
    try:
        items = as_json(text)
    except Exception:                                        # noqa: BLE001
        return {"error": "model did not return valid JSON", "raw": text[:600], "items": []}
    ids = {a["id"] for a in pool}
    items = [i for i in items if i.get("atom_id") in ids][:q.count]
    return {"items": items, "atoms_used": [{"id": a["id"], "title": a["title"]} for a in pool],
            "model": MODEL_MAIN}


GRADE_SYSTEM = """You grade one answer against one knowledge atom in a first-principles \
learning system. Be strict: a fluent answer that omits a premise or a failure boundary is \
not a passing answer. Answer in the same language as the user's answer.

Return ONLY JSON (no markdown code fences, no [EN]/[ZH] markers):
{"score": 0.0-5.0,
 "hit": ["expected points the answer actually covered"],
 "missed": ["expected points the answer did not cover, quoted from the expected list"],
 "wrong": ["statements in the answer that are incorrect, each with the correction"],
 "next_probe": "one question that targets the largest remaining gap",
 "verdict": "one sentence, no praise"}

Scoring: 5 = premises, derivation and boundary all present and correct. 4 = correct and \
complete but the boundary is stated loosely. 3 = correct result, reasoning incomplete. \
2 = right words, wrong mechanism. 1 = mostly incorrect. 0 = no relevant content."""


@app.post("/api/grade")
def grade(g: Grade):
    atoms = load_atoms()
    a = next((x for x in atoms if x["id"] == g.atom_id), None)
    if not a:
        return {"error": f"atom {g.atom_id} not found"}
    user = (f"ATOM:\n{atom_block(a)}\n\nQUESTION: {g.question}\n\n"
            f"EXPECTED POINTS: {json.dumps(g.expected, ensure_ascii=False)}\n\n"
            f"THE USER'S ANSWER (may be speech-to-text, so ignore punctuation and "
            f"filler):\n{g.answer}")
    text = call(MODEL_MAIN, GRADE_SYSTEM, user, max_tokens=1400)
    try:
        return {**as_json(text), "atom_id": a["id"], "model": MODEL_MAIN}
    except Exception:                                        # noqa: BLE001
        return {"error": "model did not return valid JSON", "raw": text[:600]}


TRANSLATE_SYSTEM = """You localise the interface of a first-principles study system from English into Traditional Chinese as written in Hong Kong (繁體中文，香港用語，非簡體、非台灣用語).

Rules:
1. Every technical term keeps its English form followed by the Chinese term in full-width parentheses on its own, e.g. "knowledge atom（知識原子）", "Feynman gate（費曼閘門）", "salience（重要度）", "FSRS", "interval（間隔）". Course names, atom ids (A0001), file names, model names and numbers stay exactly as they are.
2. Match the register of the source: direct, unsentimental, no marketing language, no exclamation marks, no emoji. Short labels stay short — a button must stay a button.
3. Do not soften judgements. If the English says a number is not yet informative, the Chinese must say the same.
4. Preserve any leading or trailing punctuation, ·, —, %, and parentheses structure.
5. Return ONLY a JSON object mapping each input string to its translation, with the input strings copied byte-for-byte as keys."""


# ---------------------------------------------------------------- W0 teaching
CACHE = DATA_DIR / "cache"
CACHE.mkdir(parents=True, exist_ok=True)


def cached(key: str, build):
    """Teaching material for one atom is static until the source changes, so it is
    generated once and read from disk afterwards. Only follow-up questions cost a call."""
    f = CACHE / f"{key}.json"
    if f.exists():
        out = json.loads(f.read_text(encoding="utf-8"))
        out["cached"] = True
        return out
    out = build()
    if "error" not in out:
        f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    out["cached"] = False
    return out


COURSE_PATH = DATA_DIR / "course_context.json"
TODAY = "2026-09-13"


def load_course() -> dict:
    with COURSE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def days_to(date_str: str) -> int:
    from datetime import date
    y, m, d = (int(x) for x in date_str.split("-"))
    ty, tm, td = (int(x) for x in TODAY.split("-"))
    return (date(y, m, d) - date(ty, tm, td)).days


def unit_of(atom: dict) -> int | None:
    m = re.search(r"Unit (\d+)", atom["source_name"])
    return int(m.group(1)) if m else None


def course_context(unit: int | None, lang: str) -> str:
    """What the course itself says this material is for. Teaching that ignores the stated
    outcomes and the deadline drifts into general interest, which is the failure mode here."""
    c = load_course()
    u = next((x for x in c["units"] if x["u"] == unit), None)
    if not u:
        return "COURSE CONTEXT: this atom is not mapped to a syllabus unit."
    outs = [o for o in c["outcomes"] if unit in o["units"]]
    ex = next((e for e in c["exams"] if unit in e["units"]), None)
    lines = [f"COURSE CONTEXT (from the uploaded 6.431x Fall 2026 syllabus and the course's "
             f"own outcome statement — today is {TODAY}):",
             f"- Unit {u['u']}: {u['name']} | lectures {', '.join(u['lec']) or '—'} | "
             f"textbook sections {u['secs']}"]
    if u.get("ps_due"):
        lines.append(f"- Problem set covering this unit is due {u['ps_due']} "
                     f"({days_to(u['ps_due'])} days from today)")
    if ex:
        lines.append(f"- {ex['name']} covers {ex['scope']} and is due {ex['due']} "
                     f"({days_to(ex['due'])} days from today)")
    if outs:
        lines.append("- Course outcomes this unit is supposed to deliver:")
        lines += [f"    {o['id']} ({o['cls']}): {o['text']}" for o in outs]
    lines.append("Teach so that these outcome verbs become true of the learner. Name the "
                 "relevant outcome id once, in one clause, without turning the lesson into "
                 "exam advice.")
    return "\n".join(lines)


def unit_neighbours(a: dict, atoms: list[dict]) -> str:
    """What the learner already owns in this unit, so teaching starts there instead of
    re-deriving ground already cleared, and so it does not silently assume an unowned atom."""
    unit = unit_of(a)
    sibs = [x for x in atoms if x["id"] != a["id"] and unit_of(x) == unit]
    if not sibs:
        return "OTHER ATOMS IN THIS UNIT: none imported yet."
    rows = []
    for x in sorted(sibs, key=lambda z: -z["salience"])[:8]:
        owned = x.get("feynman", {}).get("status") == "passed"
        rows.append(f"- [{x['id']}] salience {x['salience']} | "
                    f"{'ALREADY EXPLAINED BY THE LEARNER' if owned else 'not yet explained'} | "
                    f"{x['title']}")
    return ("OTHER ATOMS IN THIS UNIT (build on the explained ones; if you must rely on an "
            "unexplained one, say so in that step):\n" + "\n".join(rows))


def frame_placement(unit: int | None, lang: str) -> str:
    """If a framework was already built for this unit, teaching states where the atom sits
    in it. Structure first, detail second."""
    if unit is None:
        return ""
    f = CACHE / f"frame_u{unit}_{lang}.json"
    if not f.exists():
        return ""
    fr = json.loads(f.read_text(encoding="utf-8"))
    nodes = "; ".join(f"{n.get('id')} {n.get('label')} [{', '.join(n.get('atoms', []))}]"
                      for n in fr.get("nodes", []))
    return (f"FRAMEWORK ALREADY BUILT FOR THIS UNIT — shape {fr.get('shape')}, core question: "
            f"{fr.get('core_question')}\nNodes: {nodes}\nOpen the lesson by naming which node "
            f"this atom sits in, in one clause.")


TEACH_SYSTEM = """You teach ONE knowledge atom before the learner is tested on it, \
inside a first-principles system for MITx 6.431x Probability. The learner has not yet \
understood this atom. Teaching means reconstruction, not summary.

Hard rules:
1. Reason only from definitions, axioms and results the learner already has. Never justify \
a step with "the formula is", "the professor says", "this is the standard trick", or an \
analogy. Analogy may illustrate AFTER a step is derived, never as the reason for it.
2. Every step names which premise or definition it uses.
3. Each step must end with a prediction question the learner answers BEFORE the next step \
is revealed. The question must have a definite answer that follows from the step just given.
4. No praise, no filler, no restating the task.
5. Stay inside what the atom's verbatim source quote and the learner's other atoms support. \
If a step needs material outside the imported decks, say "outside the imported decks" in \
that step's `uses` field rather than presenting it as course content.
6. Name the course outcome this lesson serves once, in one clause, inside `why_it_exists`. \
Use the syllabus position (lecture, textbook section, nearest deadline) only if it changes \
what the learner should do now.
7. %s
8. Use \\( \\) for inline math and \\[ \\] for display math.
9. Assume the learner is meeting this material for the first time. Before the chain starts, \
define in `primer` EVERY technical term and symbol the steps later use — including the ones \
that look elementary, such as sample space, event, probability, union, intersection, \
complement, mutually exclusive, collectively exhaustive, partition, \
disjoint, conditional probability, prior, posterior, likelihood, \
independence, random variable, expectation, variance. The primer must cover ALL terms used \
across ALL steps — if a step uses a term, it MUST appear in the primer. Never use a term \
in a step that `primer` has not defined. Each primer entry must provide FULL definitions in \
BOTH Traditional Chinese AND English as separate fields, so the learner can read either \
language without losing meaning. Order primer entries from the MOST BASIC concept first \
(e.g. sample space, event, probability) to the MOST SPECIFIC concept last \
(e.g. partition, conditional probability, Bayes). A learner who only reads the first half \
of the primer should already understand the notation used in the steps. \
For a full lesson produce 6 to 10 primer entries; for a short lesson produce 4 to 6.
10. Teach through one ordinary situation from daily life, chosen to fit this atom, and reuse \
that SAME situation all the way through: set it up in `everyday`, and in each step's \
`concrete` field say what that step means inside it, in one or two sentences with no \
notation. Everyday examples come after the derivation of a step, never as its reason. Prefer \
situations a Hong Kong adult meets — weather, MTR delays, food deliveries, medical tests, \
phone batteries, queues, sports results — over textbook urns and dice. The `everyday` field \
and each primer term's `everyday_en` / `everyday_zh` must describe the SAME situation in \
both languages.

%s

Return ONLY JSON:
{"framework_type": "one of: causal_chain, timeline, process_steps, comparison, hierarchy — choose the structure that best fits this atom's knowledge",
 "everyday_en": "one ordinary situation, 2-3 sentences, no notation, English version",
 "everyday_zh": "the SAME situation, 2-3 sentences, no notation, Traditional Chinese version",
 "primer": [{"term_en": "the technical term or symbol in English",
             "term_zh": "the term in Traditional Chinese, Chinese characters only",
             "plain_en": "one sentence a beginner understands, English, no symbols, no other jargon",
             "plain_zh": "the SAME definition in Traditional Chinese, equally simple",
             "everyday_en": "one concrete instance inside the situation above, English",
             "everyday_zh": "the SAME instance in Traditional Chinese",
             "notation": "how it is written in this course, or empty string if none"}],
 "why_it_exists_en": "the concrete error or impossibility this concept removes, 2 sentences, English",
 "why_it_exists_zh": "the SAME explanation in Traditional Chinese",
 "trap_en": "one situation where untrained intuition gets it wrong, with the wrong answer named, English",
 "trap_zh": "the SAME trap description in Traditional Chinese",
 "steps": [{"claim_en": "what this step establishes, English",
            "claim_zh": "the SAME claim in Traditional Chinese",
            "uses": "the premise or definition this step relies on (keep as-is, short)",
            "body_en": "the derivation of this step, showing the algebra, English",
            "body_zh": "the SAME derivation explained in Traditional Chinese",
            "concrete_en": "what this step means inside the everyday situation, no notation, English",
            "concrete_zh": "the SAME concrete meaning in Traditional Chinese",
            "predict_en": "the question the learner must answer before seeing the next step, English",
            "predict_zh": "the SAME question in Traditional Chinese",
            "answer_en": "the expected answer to that question, one or two sentences, English",
            "answer_zh": "the SAME expected answer in Traditional Chinese"}],
 "boundary": {"change_en": "which premise to break, English", "change_zh": "the SAME in Traditional Chinese",
              "consequence_en": "what then fails, concretely, English", "consequence_zh": "the SAME in Traditional Chinese"},
 "numeric": {"setup": "a worked example small enough to do by hand (math is universal, keep as-is)",
             "result": "the number, with the arithmetic shown (math is universal, keep as-is)"},
 "closing_prompt": "ask the learner to write one sentence stating why this concept exists (keep as-is, short)"}"""

DEPTH = {
    "full": 'Depth: FULL. Produce 4 to 5 steps and 6 to 10 primer entries. The primer must \
define EVERY term used across ALL steps — do not omit any term that appears later. This atom \
carries salience 8 or above, so the whole chain is reconstructed, including the numeric example.',
    "short": 'Depth: SHORT. Produce exactly 2 steps — the derivation core and the boundary \
— and 4 to 6 primer entries covering ALL terms those two steps use. The primer must be \
comprehensive: if a step uses a term, it MUST be in the primer. Keep "numeric" to a single \
line. This atom is below salience 8, so time is rationed.',
}


def _normalize_teach_output(out: dict) -> dict:
    """Normalize teach output to bilingual format. Handles both old and new model output."""
    # Normalize everyday field to bilingual
    if "everyday_en" not in out and "everyday_zh" not in out:
        everyday = out.get("everyday", "")
        if everyday:
            if any(c.isalpha() and ord(c) < 128 for c in everyday):
                out["everyday_en"] = everyday
            else:
                out["everyday_zh"] = everyday

    # Normalize why_it_exists to bilingual
    if "why_it_exists_en" not in out and "why_it_exists_zh" not in out:
        why = out.get("why_it_exists", "")
        if why:
            if any(c.isalpha() and ord(c) < 128 for c in why):
                out["why_it_exists_en"] = why
            else:
                out["why_it_exists_zh"] = why

    # Normalize trap to bilingual
    if "trap_en" not in out and "trap_zh" not in out:
        trap = out.get("trap", "")
        if trap:
            if any(c.isalpha() and ord(c) < 128 for c in trap):
                out["trap_en"] = trap
            else:
                out["trap_zh"] = trap

    # Normalize steps to bilingual
    for s in out.get("steps", []):
        if "claim_en" not in s and "claim_zh" not in s:
            claim = s.get("claim", "")
            if claim:
                if any(c.isalpha() and ord(c) < 128 for c in claim):
                    s["claim_en"] = claim
                else:
                    s["claim_zh"] = claim
        if "body_en" not in s and "body_zh" not in s:
            body = s.get("body", "")
            if body:
                if any(c.isalpha() and ord(c) < 128 for c in body):
                    s["body_en"] = body
                else:
                    s["body_zh"] = body
        if "concrete_en" not in s and "concrete_zh" not in s:
            concrete = s.get("concrete", "")
            if concrete:
                if any(c.isalpha() and ord(c) < 128 for c in concrete):
                    s["concrete_en"] = concrete
                else:
                    s["concrete_zh"] = concrete
        # Normalize predict to bilingual
        if "predict_en" not in s and "predict_zh" not in s:
            predict = s.get("predict", "")
            if predict:
                if any(c.isalpha() and ord(c) < 128 for c in predict):
                    s["predict_en"] = predict
                else:
                    s["predict_zh"] = predict
        # Normalize answer to bilingual
        if "answer_en" not in s and "answer_zh" not in s:
            answer = s.get("answer", "")
            if answer:
                if any(c.isalpha() and ord(c) < 128 for c in answer):
                    s["answer_en"] = answer
                else:
                    s["answer_zh"] = answer

    # Normalize boundary to bilingual
    b = out.get("boundary", {})
    if "change_en" not in b and "change_zh" not in b:
        change = b.get("change", "")
        if change:
            if any(c.isalpha() and ord(c) < 128 for c in change):
                b["change_en"] = change
            else:
                b["change_zh"] = change
    if "consequence_en" not in b and "consequence_zh" not in b:
        cons = b.get("consequence", "")
        if cons:
            if any(c.isalpha() and ord(c) < 128 for c in cons):
                b["consequence_en"] = cons
            else:
                b["consequence_zh"] = cons
    out["boundary"] = b

    # Normalize primer terms to bilingual format
    primer = out.get("primer", [])
    new_primer = []
    for p in primer:
        np = {}
        # Handle term
        if "term_en" in p or "term_zh" in p:
            np["term_en"] = p.get("term_en", "")
            np["term_zh"] = p.get("term_zh", "")
        else:
            np["term_en"] = p.get("term", "")
            np["term_zh"] = p.get("zh", "")

        # Handle plain definition
        if "plain_en" in p or "plain_zh" in p:
            np["plain_en"] = p.get("plain_en", "")
            np["plain_zh"] = p.get("plain_zh", "")
        else:
            plain = p.get("plain", "")
            if plain:
                if any(c.isalpha() and ord(c) < 128 for c in plain):
                    np["plain_en"] = plain
                else:
                    np["plain_zh"] = plain

        # Handle everyday example
        if "everyday_en" in p or "everyday_zh" in p:
            np["everyday_en"] = p.get("everyday_en", "")
            np["everyday_zh"] = p.get("everyday_zh", "")
        else:
            ev = p.get("everyday", "")
            if ev:
                if any(c.isalpha() and ord(c) < 128 for c in ev):
                    np["everyday_en"] = ev
                else:
                    np["everyday_zh"] = ev

        np["notation"] = p.get("notation", "")
        new_primer.append(np)
    out["primer"] = new_primer
    return out


def _translate_teach_to_zh(out: dict) -> dict:
    """Translate all English-only fields to Traditional Chinese for bilingual display."""
    # --- Translate primer fields ---
    primer = out.get("primer", [])
    primer_needs = []
    for i, p in enumerate(primer):
        if p.get("plain_en") and not p.get("plain_zh"):
            primer_needs.append((i, "plain_en", p["plain_en"]))
        if p.get("everyday_en") and not p.get("everyday_zh"):
            primer_needs.append((i, "everyday_en", p["everyday_en"]))

    if primer_needs:
        items = []
        for idx, field, text in primer_needs:
            term = primer[idx].get("term_en", primer[idx].get("term_zh", ""))
            items.append(f"[{idx}:{field}] {term}: {text}")
        translate_prompt = "Translate the following English definitions to Traditional Chinese (Hong Kong usage). Keep technical terms in English with Chinese after in parentheses. Return ONLY a JSON object mapping each key to its Chinese translation.\n\n" + "\n".join(items)
        try:
            zh_text = call(MODEL_FAST, "You are a translator. Return ONLY valid JSON.", translate_prompt, max_tokens=2000)
            zh_map = as_json(zh_text)
            for idx, field, text in primer_needs:
                key = f"{idx}:{field}"
                if key in zh_map:
                    primer[idx][field.replace("_en", "_zh")] = zh_map[key]
        except Exception:
            pass
    out["primer"] = primer

    # --- Translate everyday field ---
    if out.get("everyday_en") and not out.get("everyday_zh"):
        try:
            zh_everyday = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", out["everyday_en"], max_tokens=500)
            out["everyday_zh"] = zh_everyday.strip()
        except Exception:
            pass

    # --- Translate why_it_exists ---
    if out.get("why_it_exists_en") and not out.get("why_it_exists_zh"):
        try:
            zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", out["why_it_exists_en"], max_tokens=500)
            out["why_it_exists_zh"] = zh.strip()
        except Exception:
            pass

    # --- Translate trap ---
    if out.get("trap_en") and not out.get("trap_zh"):
        try:
            zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", out["trap_en"], max_tokens=500)
            out["trap_zh"] = zh.strip()
        except Exception:
            pass

    # --- Translate step fields ---
    for s in out.get("steps", []):
        if s.get("claim_en") and not s.get("claim_zh"):
            try:
                zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", s["claim_en"], max_tokens=200)
                s["claim_zh"] = zh.strip()
            except Exception:
                pass
        if s.get("body_en") and not s.get("body_zh"):
            try:
                zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", s["body_en"], max_tokens=500)
                s["body_zh"] = zh.strip()
            except Exception:
                pass
        if s.get("concrete_en") and not s.get("concrete_zh"):
            try:
                zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", s["concrete_en"], max_tokens=200)
                s["concrete_zh"] = zh.strip()
            except Exception:
                pass

    # --- Translate boundary fields ---
    b = out.get("boundary", {})
    if b.get("change_en") and not b.get("change_zh"):
        try:
            zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", b["change_en"], max_tokens=200)
            b["change_zh"] = zh.strip()
        except Exception:
            pass
    if b.get("consequence_en") and not b.get("consequence_zh"):
        try:
            zh = call(MODEL_FAST, "Translate to Traditional Chinese (Hong Kong usage). Return ONLY the translation, no JSON.", b["consequence_en"], max_tokens=300)
            b["consequence_zh"] = zh.strip()
        except Exception:
            pass
    out["boundary"] = b

    return out


class Teach(BaseModel):
    atom_id: str
    lang: str = "en"


@app.post("/api/teach")
def teach(t: Teach):
    atoms = load_atoms()
    a = next((x for x in atoms if x["id"] == t.atom_id), None)
    if not a:
        return {"error": "unknown atom"}
    depth = "full" if a["salience"] >= 8 else "short"
    others = [x for x in atoms if x["id"] != a["id"]][:0]

    def build():
        system = TEACH_SYSTEM % (LANG_RULE.get(t.lang, LANG_RULE["en"]), DEPTH[depth])
        unit = unit_of(a)
        payload = "\n\n".join(x for x in [
            course_context(unit, t.lang),
            frame_placement(unit, t.lang),
            unit_neighbours(a, atoms),
            f"ATOM TO TEACH:\n{atom_block(a)}",
            "Teach it. Efficiency rule: do not re-derive anything the learner already owns, "
            "do not restate the atom's own wording back as a lesson, and spend the steps on "
            "the one move that is actually hard. The primer is exempt from that rule: define "
            "the vocabulary every time, because the learner may be meeting these words for "
            "the first time, and a term used before it is defined makes the chain unreadable.",
        ] if x)
        text = call(MODEL_MAIN, system, payload, max_tokens=6000)
        try:
            out = as_json(text)
        except Exception:                                    # noqa: BLE001
            return {"error": "model did not return valid JSON", "raw": (text or "")[:500]}
        # Normalize primer to bilingual format (handles both old and new model output)
        out = _normalize_teach_output(out)
        # Translate all fields to Chinese for bilingual display
        out = _translate_teach_to_zh(out)
        out["atom_id"] = a["id"]
        out["depth"] = depth
        out["salience"] = a["salience"]
        out["model"] = MODEL_MAIN
        return out

    return cached(f"teach2_{a['id']}_{t.lang}", build)


# ---------------------------------------------------------------- frameworks
FRAME_SYSTEM = """You build ONE framework that organises a set of knowledge atoms so the \
learner can hold a unit in mind as a structure instead of a list.

Choose the shape that the material actually has, and say why the others were rejected:
- reference: the structure the field already uses (textbook chapter logic, a standard \
classification). Cheapest and usually correct for mathematics.
- why_chain: each node answers "why does the node above it hold", ending at an axiom.
- timeline: only when the content is genuinely sequential in time (history, a course \
schedule, a stochastic process evolving). Mathematics is usually NOT a timeline — if you \
pick this shape for a mathematics unit you must justify it or pick another.
- process: the ordered steps of doing something, e.g. how to compute a probability.

Hard rules:
1. Every node must cite the atom ids it is built from. A node with no atom is allowed ONLY \
as a gap node, marked "gap": true, and it must name what material is missing.
2. At most 7 nodes and at most 9 edges — a framework you cannot hold in your head is not a \
framework. Keep every field to one sentence.
3. Name the one question the whole unit answers. If the unit answers more than one, the \
framework is wrong — split it and say so.
4. State the edges: which node depends on which, and why. No decorative structure.
5. No praise, no filler. %s

Return ONLY JSON:
{"shape": "reference|why_chain|timeline|process",
 "shape_reason": "why this shape and not the others, naming the rejected ones",
 "core_question": "the single question this unit answers",
 "nodes": [{"id": "N1", "label": "short label", "claim": "one sentence of content",
            "atoms": ["A0001"], "gap": false, "missing": ""}],
 "edges": [{"from": "N1", "to": "N2", "why": "the dependency in one clause"}],
 "process_steps": ["if the shape is process, the ordered steps; otherwise an empty list"],
 "two_pass": {"pass1": "the skim map: what to notice on a first fast read, 2 sentences",
              "pass2": "what the second, summarising read must produce, 2 sentences"},
 "recall_prompt": "the instruction that makes the learner reproduce this framework from memory"}"""


class Frame(BaseModel):
    unit: str
    lang: str = "en"


@app.post("/api/frame")
def frame(f: Frame):
    atoms = load_atoms()
    pool = [a for a in atoms if re.search(rf"Unit {f.unit}\b", a["source_name"])]
    if not pool:
        return {"error": f"no atoms imported for Unit {f.unit}"}
    library = "\n\n".join(atom_block(a) for a in sorted(pool, key=lambda a: -a["salience"]))

    def build():
        text = call(MODEL_MAIN, FRAME_SYSTEM % LANG_RULE.get(f.lang, LANG_RULE["en"]),
                    f"{course_context(int(f.unit) if str(f.unit).isdigit() else None, f.lang)}\n\n"
                    f"UNIT {f.unit} ATOMS ({len(pool)} of them):\n\n{library}\n\n"
                    f"Build the framework so that the nodes carry the stated outcomes for this "
                    f"unit. Mark as a gap node anything the syllabus sections imply but the "
                    f"atoms do not cover.", max_tokens=8000)
        try:
            out = as_json(text)
        except Exception:                                    # noqa: BLE001
            return {"error": "model did not return valid JSON", "raw": text[:500]}
        out["unit"] = f.unit
        out["atom_count"] = len(pool)
        out["model"] = MODEL_MAIN
        return out

    return cached(f"frame_u{f.unit}_{f.lang}", build)


FRAME_GRADE_SYSTEM = """You compare a framework the learner reproduced from memory against \
the stored framework for that unit. Output knowledge is the point: what they could not \
reproduce is what they do not own.

Be strict about structure, not wording. A node named differently but placed correctly is a \
hit. A node listed without its dependency is a partial hit at best. %s

Return ONLY JSON:
{"score": 0.0-5.0,
 "nodes_hit": ["stored nodes the learner reproduced"],
 "nodes_missed": ["stored nodes absent from the reproduction"],
 "edges_wrong": ["dependencies the learner stated backwards or invented, each corrected"],
 "extra": ["things the learner added that are not in the stored framework — say whether each is legitimate"],
 "verdict": "one sentence naming the structural weakness, no praise",
 "next_probe": "one question aimed at the missing structure"}"""


class FrameGrade(BaseModel):
    unit: str
    answer: str
    lang: str = "en"


@app.post("/api/frame_grade")
def frame_grade(g: FrameGrade):
    stored = frame(Frame(unit=g.unit, lang=g.lang))
    if "error" in stored:
        return stored
    ref = json.dumps({k: stored.get(k) for k in ("core_question", "nodes", "edges", "shape")},
                     ensure_ascii=False)
    text = call(MODEL_MAIN, FRAME_GRADE_SYSTEM % LANG_RULE.get(g.lang, LANG_RULE["en"]),
                f"STORED FRAMEWORK:\n{ref}\n\nLEARNER REPRODUCTION:\n{g.answer}",
                max_tokens=1800)
    try:
        out = as_json(text)
    except Exception:                                        # noqa: BLE001
        return {"error": "model did not return valid JSON", "raw": text[:400]}
    out["model"] = MODEL_MAIN
    return out


class Translate(BaseModel):
    strings: list[str]
    lang: str = "zh"


class Summary(BaseModel):
    atom_id: str
    lang: str = "en"


class TitleGen(BaseModel):
    message: str
    lang: str = "en"


TITLE_SYSTEM = """You generate a short, descriptive title for a conversation. \
The title should be 3-6 words, capturing the main topic. \
Return ONLY the title text, no quotes, no explanation. \
If the message is in Chinese, return a Chinese title. If English, return English."""


@app.post("/api/gen_title")
def gen_title(t: TitleGen):
    try:
        text = call(MODEL_FAST, TITLE_SYSTEM, t.message[:500], max_tokens=20)
        title = text.strip().strip('"').strip("'")[:80]
        return {"title": title}
    except Exception as e:
        # Fallback: use first few words of message
        words = t.message.split()[:6]
        return {"title": " ".join(words) + ("..." if len(t.message.split()) > 6 else "")}


SUMMARY_SYSTEM = """You generate a one-page Knowledge Summary Card for a first-principles \
learning system. The card helps the learner consolidate what they just learned.

Rules:
1. Be concise — the entire card must fit on one screen.
2. Use plain language, not jargon. Define every technical term.
3. Include ONE concrete everyday example with actual numbers.
4. Answer in the same language as the request.
5. Return ONLY JSON (no markdown code fences):
{"core_idea": "one sentence, no formulas",
 "key_formula": "the formula in LaTeX if applicable, or null",
 "formula_explained": "plain-English explanation of what the formula means",
 "everyday_example": "one concrete example from daily life with numbers walked through",
 "common_mistake": "the most common error learners make and why it is wrong",
 "prerequisites": ["atom titles this builds on"],
 "next_steps": ["atom titles to learn next"]}"""


@app.post("/api/summary")
def summary(s: Summary):
    atom = ATOMS_BY_ID.get(s.atom_id)
    if not atom:
        return {"error": "atom not found"}
    context = json.dumps({
        "atom_id": atom["id"],
        "title": atom["title"],
        "source_quote": atom.get("source_quote", ""),
        "irreducible_premises": atom.get("irreducible_premises", []),
        "failure_modes": atom.get("failure_modes", [])
    }, ensure_ascii=False, indent=1)
    try:
        text = call(MODEL_MAIN, SUMMARY_SYSTEM % LANG_RULES.get(s.lang, ""),
                    context, max_tokens=1200)
        card = as_json(text)
        return {"card": card, "model": MODEL_MAIN}
    except Exception as e:
        return {"error": str(e), "raw": text[:400] if 'text' in dir() else ""}


@app.post("/api/translate")
def translate(t: Translate):
    text = call(MODEL_MAIN, TRANSLATE_SYSTEM,
                json.dumps(t.strings, ensure_ascii=False, indent=1), max_tokens=8000)
    try:
        return {"map": as_json(text)}
    except Exception:                                        # noqa: BLE001
        return {"error": "invalid JSON", "raw": text[:400]}


# ---------- static frontend ----------
STATIC_DIR = Path(__file__).parent
STATIC_FILES = {
    "app.css": "text/css",
    "app.js": "application/javascript",
    "ai.js": "application/javascript",
    "teach.js": "application/javascript",
    "data.js": "application/javascript",
    "course.js": "application/javascript",
    "library.js": "application/javascript",
    "i18n.js": "application/javascript",
    "sw.js": "application/javascript",
    "manifest.json": "application/json",
}

@app.get("/{filename}")
async def serve_static(filename: str):
    if filename in STATIC_FILES:
        path = STATIC_DIR / filename
        if path.exists():
            return FileResponse(path, media_type=STATIC_FILES[filename])
    return {"error": "not found"}

@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
