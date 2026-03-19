"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentPortrait } from "@/components/shared/agent-portrait";

interface Comment {
  id: string;
  content: string;
  author_id: string;
  author_name?: string;
  author_portrait?: string;
  score?: number;
  depth?: number;
  parent_comment_id?: string;
}

interface Thread {
  id: string;
  title: string;
  author_id: string;
  author_name?: string;
  author_portrait?: string;
  subreddit?: string;
  score?: number;
  comments?: Comment[];
}

interface RedditThreadProps {
  threads: Thread[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

function CommentNode({
  comment,
  onAgentClick,
  depth = 0,
}: {
  comment: Comment;
  onAgentClick?: (agentId: string) => void;
  depth?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
      style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}
    >
      {depth > 0 && (
        <div className="absolute left-[-8px] top-0 bottom-0 w-[2px] bg-border/30" />
      )}
      <div
        className="py-1.5 px-2 hover:bg-card/40 transition-colors cursor-pointer"
        onClick={() => comment.author_id && onAgentClick?.(comment.author_id)}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <AgentPortrait
            src={comment.author_portrait}
            name={comment.author_name || "Agent"}
            size="sm"
            className="!size-5"
          />
          <span className="font-[family-name:var(--font-pixel)] text-[6px] text-[#9BBC0F]">
            {comment.author_name || "Anonymous"}
          </span>
          <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
            {(comment.score || 0) > 0 ? "▲" : "▽"} {comment.score || 0}
          </span>
        </div>
        <p className="font-[family-name:var(--font-pixel-body)] text-[13px] text-foreground/85 leading-tight pl-6">
          {comment.content}
        </p>
      </div>
    </motion.div>
  );
}

export function RedditThread({ threads, onAgentClick, className }: RedditThreadProps) {
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  return (
    <div className={`flex flex-col gap-1 overflow-y-auto max-h-[600px] ${className || ""}`}>
      <div className="px-3 py-2 border-b-2 border-border">
        <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#E05038]">
          Discussion Threads
        </h3>
      </div>
      {threads.map((thread, i) => (
        <motion.div
          key={thread.id || i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="border-b border-border/40"
        >
          <div
            className="px-3 py-2 hover:bg-card/60 transition-colors cursor-pointer"
            onClick={() => setExpandedThread(expandedThread === thread.id ? null : thread.id)}
          >
            <div className="flex items-center gap-1 mb-1">
              <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#5B8CF0] bg-[#5B8CF0]/10 px-1.5 py-0.5 border border-[#5B8CF0]/30">
                {thread.subreddit || "r/Simulation"}
              </span>
              <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
                by {thread.author_name || "OP"}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-0.5 text-muted-foreground min-w-[20px]">
                <span className="text-[8px]">▲</span>
                <span className="font-[family-name:var(--font-pixel)] text-[7px] text-[#F8B800]">
                  {thread.score || 0}
                </span>
                <span className="text-[8px]">▽</span>
              </div>
              <div className="flex-1">
                <h4 className="font-[family-name:var(--font-pixel)] text-[7px] text-foreground leading-tight">
                  {thread.title}
                </h4>
                <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground mt-0.5">
                  {thread.comments?.length || 0} comments
                  {expandedThread === thread.id ? " ▴" : " ▾"}
                </span>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {expandedThread === thread.id && thread.comments && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-dashed border-border/30 bg-background/50"
              >
                <div className="px-2 py-1">
                  {thread.comments.map((comment) => (
                    <CommentNode
                      key={comment.id}
                      comment={comment}
                      onAgentClick={onAgentClick}
                      depth={comment.depth || 0}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
      {threads.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <span className="font-[family-name:var(--font-pixel)] text-[7px] uppercase tracking-widest">
            No threads yet...
          </span>
        </div>
      )}
    </div>
  );
}
