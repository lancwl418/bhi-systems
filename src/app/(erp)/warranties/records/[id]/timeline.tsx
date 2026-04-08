"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, Loader2 } from "lucide-react";

interface Comment {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

export function WarrantyTimeline({
  warrantyId,
  comments: initialComments,
}: {
  warrantyId: string;
  comments: Comment[];
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/warranties/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_id: warrantyId,
          content: newComment.trim(),
          author: "CS",
        }),
      });

      const data = await res.json();
      if (data.ok && data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Timeline ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing comments */}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {c.author.slice(0, 2).toUpperCase()}
              </div>
              <div className="w-px flex-1 bg-border mt-1" />
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{c.author}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.content}</p>
            </div>
          </div>
        ))}

        {/* Add comment */}
        <div className="flex gap-2 pt-2 border-t">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            size="sm"
            className="self-end"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
