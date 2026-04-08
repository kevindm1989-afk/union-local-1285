import { useState, useRef, useEffect, useCallback } from "react";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, User, Send, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hi! I'm your union assistant. I can help you understand your rights and entitlements under the Collective Agreement — including wages, scheduling, discipline, leaves, and more.\n\nWhat would you like to know?",
};

export default function MemberPortalCbaAssistant() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 30);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { role: "user", content: text };
    const history = [...messages.filter((m) => !m.streaming), userMsg];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/member-portal/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to assistant");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.content) {
              accumulated += payload.content;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: accumulated, streaming: true };
                return next;
              });
            }
            if (payload.done || payload.error) break;
          } catch {
            // ignore parse errors
          }
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: accumulated, streaming: false };
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Sorry, I couldn't connect to the assistant right now. Please try again.",
          streaming: false,
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([WELCOME]);
    setInput("");
    textareaRef.current?.focus();
  };

  return (
    <MemberPortalLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-none">CBA Assistant</p>
              <p className="text-[10px] text-muted-foreground">Powered by AI · Session only</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="gap-1.5 text-xs h-7 text-muted-foreground"
            disabled={sending}
          >
            <RotateCcw className="w-3 h-3" /> New Chat
          </Button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2.5 items-start",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {msg.role === "user" ? (
                  <User className="w-3.5 h-3.5" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                )}
              >
                {msg.content ? (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                ) : (
                  <span className="inline-flex gap-1 items-center text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
                  </span>
                )}
                {msg.streaming && msg.content && (
                  <span className="inline-block w-0.5 h-4 bg-current opacity-70 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border/50 px-3 py-3 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your CBA rights…"
              rows={1}
              disabled={sending}
              className="resize-none text-sm min-h-[40px] max-h-[120px] flex-1 rounded-xl bg-muted border-0 focus-visible:ring-1"
              style={{ overflowY: "auto" }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-xl shrink-0"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
            AI can make mistakes. Verify important information with your steward.
          </p>
        </div>
      </div>
    </MemberPortalLayout>
  );
}
