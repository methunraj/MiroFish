"use client";

import { motion } from "framer-motion";

interface TrendingTopic {
  hashtag: string;
  count: number;
  virality_score?: number;
}

interface ViralPost {
  id: string;
  content: string;
  agent_name?: string;
  agent_portrait?: string;
  likes?: number;
  retweets?: number;
  virality_score?: number;
}

interface TrendingPanelProps {
  topics: TrendingTopic[];
  viralPosts?: ViralPost[];
  className?: string;
}

export function TrendingPanel({ topics, viralPosts, className }: TrendingPanelProps) {
  return (
    <div className={`flex flex-col gap-2 p-2 ${className || ""}`}>
      <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#F8B800] px-1">
        Trending
      </h3>

      {/* Hashtags */}
      <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
        <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
          Hashtags
        </span>
        <div className="mt-1 space-y-1">
          {topics.slice(0, 10).map((topic, i) => (
            <motion.div
              key={topic.hashtag}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground w-3 text-right">
                  {i + 1}
                </span>
                <span className="font-[family-name:var(--font-pixel-body)] text-sm text-[#5B8CF0]">
                  {topic.hashtag}
                </span>
              </div>
              <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-foreground/60">
                {topic.count} posts
              </span>
            </motion.div>
          ))}
          {topics.length === 0 && (
            <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
              Nothing trending yet...
            </span>
          )}
        </div>
      </div>

      {/* Viral posts */}
      {viralPosts && viralPosts.length > 0 && (
        <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
          <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase flex items-center gap-1">
            <span className="text-[#E05038]">🔥</span> Viral Posts
          </span>
          <div className="mt-1 space-y-1.5">
            {viralPosts.slice(0, 5).map((post, i) => (
              <motion.div
                key={post.id || i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="px-1.5 py-1 border border-[#F8B800]/20 bg-[#F8B800]/5"
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="font-[family-name:var(--font-pixel)] text-[6px] text-[#9BBC0F]">
                    {post.agent_name}
                  </span>
                  <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-[#F8B800]">
                    ♥{post.likes || 0} ↻{post.retweets || 0}
                  </span>
                </div>
                <p className="font-[family-name:var(--font-pixel-body)] text-[11px] text-foreground/80 leading-tight">
                  {post.content?.slice(0, 120)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
