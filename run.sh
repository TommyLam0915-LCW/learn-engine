#!/bin/bash
# learn-engine server launcher (frontend + backend) with automatic provider detection
# Usage: ./run.sh [provider]
#   provider: openrouter, gemini, groq, ollama, mock (default: auto-detect)
#
# Serves both the frontend SPA and API on the same port.
# Access from mobile: find your computer's local IP and visit http://<IP>:8000

cd "$(dirname "$0")"

echo "🎓 learn-engine server (frontend + backend)"
echo "==========================================="
echo ""

case "$1" in
  openrouter)
    if [ -z "$OPENROUTER_API_KEY" ]; then
      echo " OPENROUTER_API_KEY not set"
      echo "Get a free key at: https://openrouter.ai/keys"
      echo ""
      read -p "Enter your OpenRouter API key: " key
      export OPENROUTER_API_KEY="$key"
    fi
    echo "✅ Using OpenRouter (free models: DeepSeek, Gemini, Llama)"
    ;;
  gemini)
    if [ -z "$GEMINI_API_KEY" ]; then
      echo "❌ GEMINI_API_KEY not set"
      echo "Get a free key at: https://aistudio.google.com/app/apikey"
      echo ""
      read -p "Enter your Gemini API key: " key
      export GEMINI_API_KEY="$key"
    fi
    echo "✅ Using Google Gemini (free tier)"
    ;;
  groq)
    if [ -z "$GROQ_API_KEY" ]; then
      echo "❌ GROQ_API_KEY not set"
      echo "Get a free key at: https://console.groq.com/keys"
      echo ""
      read -p "Enter your Groq API key: " key
      export GROQ_API_KEY="$key"
    fi
    echo "✅ Using Groq (free tier, runs Llama/DeepSeek)"
    ;;
  ollama)
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
      echo " Ollama not running"
      echo "Install from: https://ollama.com"
      echo "Then run: ollama pull llama3"
      exit 1
    fi
    echo "✅ Using Ollama (local, completely free)"
    ;;
  mock|"")
    echo "⚠️  Using mock mode (pre-written responses for UI testing)"
    echo "To enable live AI, run: ./run.sh openrouter  OR  ./run.sh gemini  OR  ./run.sh groq"
    ;;
  *)
    echo "Usage: ./run.sh [openrouter|gemini|groq|ollama|mock]"
    exit 1
    ;;
esac

echo ""
echo "Starting server on http://localhost:8000 ..."
echo "  Frontend: http://localhost:8000/"
echo "  Mobile:   http://$(ipconfig getifaddr en0 2>/dev/null || echo '<your-IP>'):8000/"
echo "Press Ctrl+C to stop"
echo ""

python3 server.py
