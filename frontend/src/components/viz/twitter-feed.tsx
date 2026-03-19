"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AgentPortrait } from "@/components/shared/agent-portrait";

interface Post {
  id: string;
  content: string;
  agent_id: string;
  agent_name?: string;
  agent_portrait?: string;
  hashtags?: string[];
  sentiment?: string;
  likes?: number;
  retweets?: number;
  post_type?: string;
  created_at?: string;
}

interface TwitterFeedProps {
  posts: Post[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

export function TwitterFeed({ posts, onAgentClick, className }: TwitterFeedProps) {
  const sentimentColor = (s?: string) => {
    if (s === "positive") return "text-[#9BBC0F]";
    if (s === "negative") return "text-[#E05038]";
    return "text-[#5B8CF0]";
  };

  return (
    <div className={`flex flex-col gap-1 overflow-y-auto max-h-[600px] ${className || ""}`}>
      <div className="px-3 py-2 border-b-2 border-border">
        <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#9BBC0F]">
          Social Feed
        </h3>
      </div>
      <AnimatePresence mode="popLayout">
        {posts.map((post, i) => (
          <motion.div
            key={post.id || i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ delay: i * 0.03, duration: 0.2 }}
            className="px-3 py-2 border-b border-dashed border-border/40 hover:bg-card/60 transition-colors cursor-pointer"
            onClick={() => post.agent_id && onAgentClick?.(post.agent_id)}
          >
            <div className="flex gap-2 items-start">
              <AgentPortrait
                src={post.agent_portrait}
                name={post.agent_name || "Agent"}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-[family-name:var(--font-pixel)] text-[7px] text-foreground truncate">
                    {post.agent_name || "Agent"}
                  </span>
                  <span className={`font-[family-name:var(--font-pixel-sm)] text-[9px] ${sentimentColor(post.sentiment)}`}>
                    {post.sentiment === "positive" ? "●" : post.sentiment === "negative" ? "▼" : "◆"}
                  </span>
                  {post.post_type === "retweet" && (
                    <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">↻ RT</span>
                  )}
                </div>
                <p className="font-[family-name:var(--font-pixel-body)] text-sm text-foreground/90 leading-tight">
                  {post.content}
                </p>
                {post.hashtags && post.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {post.hashtags.map((tag, ti) => (
                      <span
                        key={ti}
                        className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#5B8CF0]"
                      >
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 mt-1.5">
                  <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground flex items-center gap-1">
                    ♥ {post.likes || 0}
                  </span>
                  <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground flex items-center gap-1">
                    ↻ {post.retweets || 0}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {posts.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <span className="font-[family-name:var(--font-pixel)] text-[7px] uppercase tracking-widest">
            No posts yet...
          </span>
        </div>
      )}
    </div>
  );
}
