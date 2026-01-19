"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export function TagInput({ value, onChange, placeholder }) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && inputValue.trim() !== "") {
      event.preventDefault();
      onChange([...value, inputValue.trim()]);
      setInputValue("");
    }
  };

  const removeTag = (tagToRemove) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="relative w-full border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <div className="flex flex-wrap items-center gap-1 p-1">
        {value.map((tag, index) => (
          <Badge key={index} variant="secondary" className="text-xs">
            {tag}
            <X
              className="w-3 h-3 ml-1 cursor-pointer"
              onClick={() => removeTag(tag)}
            />
          </Badge>
        ))}
        <Input
          type="text"
          value={inputValue}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => setInputValue(e.target.value)}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            e.preventDefault();
            if (inputValue.trim() !== "") {
              onChange([...value, inputValue.trim()]);
              setInputValue("");
            }
          }}
          className="flex-grow !border-none !ring-0 !focus-visible:ring-0 !focus-visible:ring-offset-0 h-8 text-sm p-0 placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
