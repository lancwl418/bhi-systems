"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Save, X, Loader2 } from "lucide-react";

export function CustomerEditForm({
  email,
  initialName,
  initialPhone,
  address,
}: {
  email: string;
  initialName: string;
  initialPhone: string;
  address: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/customers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, phone }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditing(false);
        window.location.reload();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Customer Info
        </CardTitle>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-7 gap-1"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setName(initialName);
                setPhone(initialPhone);
              }}
              className="h-7"
            >
              <X className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-7 gap-1"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {editing ? (
          <>
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <p className="text-sm mt-1">{email}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{phone || "—"}</span>
            </div>
            {address?.street && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-xs">Address</span>
                <p className="mt-1">{address.street}</p>
                <p>
                  {[address.city, address.province, address.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
