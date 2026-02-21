"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatSidebar } from "./chat-sidebar";
import { ProductSelector } from "./product-selector";
import type { OptionsPanelData } from "./options-panel";
import type { PhotoOptions } from "./photo-options-panel";
import { Sparkles, Image, ShoppingBag, Tag, ArrowLeft, PanelRightClose, PanelRightOpen, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { extractUrls } from "@/lib/detect-url";
import { useScrapeProducts } from "@/hooks/use-scrape-products";

interface UploadedImage {
  url: string;
  name: string;
}

const QUICK_ACTIONS = [
  { label: "Create Image", icon: Image, prompt: "I want to create a professional product photo" },
  { label: "Lifestyle Shot", icon: ShoppingBag, prompt: "I want a lifestyle photo showing my product in use" },
  { label: "Sale Banner", icon: Tag, prompt: "I need a promotional sale image with discount text" },
];

interface ScrapeSession {
  active: boolean;
  url: string;
  confirmed: boolean;
  confirmedProducts: { url: string; name: string }[];
}

export function ChatPage() {
  const { messages, sendMessage, status, addToolOutput } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [scrapeSession, setScrapeSession] = useState<ScrapeSession | null>(null);
  const scraper = useScrapeProducts();

  const [sidebarOverrides, setSidebarOverrides] = useState<Partial<PhotoOptions>>({});
  const scrapeConfirmedAtMsgCount = useRef<number | null>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && !scrapeSession;

  // Extract photo options from update_photo_options tool calls in messages
  const photoOptionsFromMessages = useMemo<PhotoOptions>(() => {
    const accumulated: PhotoOptions = {};
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-update_photo_options") {
          const toolPart = part as {
            type: string;
            input?: Partial<PhotoOptions>;
          };
          if (toolPart.input) {
            Object.assign(accumulated, toolPart.input);
          }
        }
      }
    }
    return accumulated;
  }, [messages]);

  // Merge message-derived options with sidebar overrides
  const effectivePhotoOptions = useMemo<PhotoOptions>(
    () => ({ ...photoOptionsFromMessages, ...sidebarOverrides }),
    [photoOptionsFromMessages, sidebarOverrides]
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-hide "products added" card after next message arrives
  useEffect(() => {
    if (scrapeSession?.confirmed && scrapeConfirmedAtMsgCount.current !== null) {
      if (messages.length > scrapeConfirmedAtMsgCount.current) {
        setScrapeSession(null);
        scrapeConfirmedAtMsgCount.current = null;
      }
    }
  }, [messages.length, scrapeSession?.confirmed]);

  // Include image URLs and photo options in every message so the agent always knows about them
  const sendWithContext = useCallback(
    (text: string) => {
      const imageContext =
        uploadedImages.length > 0
          ? `\n\n[Uploaded product image URLs: ${uploadedImages.map((img) => img.url).join(", ")}]`
          : "";

      const hasOptions = Object.values(effectivePhotoOptions).some(
        (v) => v !== undefined
      );
      const optionsContext = hasOptions
        ? `\n\n[Current photo options: ${JSON.stringify(effectivePhotoOptions)}]`
        : "";

      sendMessage({ text: text + imageContext + optionsContext });
    },
    [sendMessage, uploadedImages, effectivePhotoOptions]
  );

  // Extract options from the latest assistant message's present_options tool part
  const currentOptions = useMemo((): OptionsPanelData | null => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return null;

    const optionsPart = lastAssistant.parts.find(
      (p) =>
        p.type === "tool-present_options" &&
        (p as { state?: string }).state === "input-available"
    ) as
      | {
          type: string;
          toolCallId: string;
          state: string;
          input: {
            question: string;
            options: { label: string; description?: string }[];
            allowCustom?: boolean;
            allowSkip?: boolean;
          };
        }
      | undefined;

    if (!optionsPart?.input) return null;

    return {
      toolCallId: optionsPart.toolCallId,
      question: optionsPart.input.question,
      options: optionsPart.input.options,
      allowCustom: optionsPart.input.allowCustom,
      allowSkip: optionsPart.input.allowSkip,
    };
  }, [messages]);

  function handleOptionSelect(label: string) {
    if (currentOptions) {
      addToolOutput({
        tool: "present_options",
        toolCallId: currentOptions.toolCallId,
        output: { selected: label },
      });
    }
    sendWithContext(label);
  }

  function handleOptionSkip() {
    if (currentOptions) {
      addToolOutput({
        tool: "present_options",
        toolCallId: currentOptions.toolCallId,
        output: { skipped: true },
      });
    }
    sendWithContext("Skip this step");
  }

  function handleSend(text: string) {
    const urls = extractUrls(text);

    if (urls.length > 0 && (!scrapeSession || scrapeSession.confirmed)) {
      // When a store URL is detected, just start scraping without asking the AI anything
      const scrapeUrl = urls[0];
      setScrapeSession({
        active: true,
        url: scrapeUrl,
        confirmed: false,
        confirmedProducts: [],
      });
      scraper.scrape(scrapeUrl);
    } else {
      sendWithContext(text);
    }
  }

  function handleScrapeConfirm(selected: { url: string; name: string }[]) {
    setUploadedImages((prev) => [
      ...prev,
      ...selected.filter(
        (s) => !prev.some((existing) => existing.url === s.url)
      ),
    ]);
    setScrapeSession((prev) =>
      prev ? { ...prev, confirmed: true, confirmedProducts: selected } : null
    );
    // Track when confirmation happened so we can auto-hide after next message
    scrapeConfirmedAtMsgCount.current = messages.length;
  }

  function handleScrapeDismiss() {
    setScrapeSession(null);
    scraper.reset();
  }

  function handleQuickAction(prompt: string) {
    sendWithContext(prompt);
  }

  function handleImagesUploaded(images: UploadedImage[]) {
    setUploadedImages((prev) => [...prev, ...images]);
  }

  function handleRemoveImage(url: string) {
    setUploadedImages((prev) => prev.filter((img) => img.url !== url));
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Photo Studio AI</h1>
          </div>
          {!isEmpty && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-auto"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? "Close brand panel" : "Open brand panel"}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          )}
        </header>

        {isEmpty ? (
          /* Empty state: CTA + input centered in the middle */
          <div className="flex-1 flex flex-col items-center justify-center px-4 gap-8">
            <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-700">
              <div className="rounded-full bg-primary/10 p-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-center">
                Product Photo Studio
              </h2>
              <p className="text-muted-foreground text-center max-w-md">
                Share your ecommerce link and I&apos;ll create stunning
                AI-generated product photography for you.
              </p>
            </div>

            <div
              className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
              style={{ animationFillMode: "both" }}
            >
              <ChatInput
                onSend={handleSend}
                isDisabled={isLoading}
                onImagesUploaded={handleImagesUploaded}
                uploadedImages={uploadedImages}
                onRemoveImage={handleRemoveImage}
                placeholder="Paste your ecommerce link to get started..."
              />
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Paste your store URL or upload product images
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Messages state: standard chat layout */
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4">
              <div className="mx-auto max-w-2xl py-8">
                <div className="space-y-6">
                  {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))}

                  {scrapeSession && scrapeSession.active && (
                    <ProductSelector
                      status={
                        scraper.status === "idle" ? "loading" : scraper.status
                      }
                      products={scraper.products}
                      storeName={scraper.storeName}
                      error={scraper.error}
                      confirmed={scrapeSession.confirmed}
                      confirmedProducts={scrapeSession.confirmedProducts}
                      onConfirm={handleScrapeConfirm}
                      onDismiss={handleScrapeDismiss}
                    />
                  )}

                  {isLoading && status === "submitted" && (
                    <div className="flex gap-3 animate-in fade-in duration-300">
                      <div className="shrink-0 rounded-full bg-primary/10 p-2 h-8 w-8 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex gap-1 items-center text-muted-foreground text-sm pt-1.5">
                        <span className="animate-pulse">Thinking</span>
                        <span
                          className="animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        >
                          .
                        </span>
                        <span
                          className="animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        >
                          .
                        </span>
                        <span
                          className="animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        >
                          .
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div ref={scrollRef} />
              </div>
            </div>

            {/* Input area - slides in from bottom */}
            <div className="border-t bg-background/80 backdrop-blur-sm px-4 py-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
              <div className="mx-auto max-w-2xl">
                <ChatInput
                  onSend={handleSend}
                  isDisabled={isLoading}
                  onImagesUploaded={handleImagesUploaded}
                  uploadedImages={uploadedImages}
                  onRemoveImage={handleRemoveImage}
                  options={currentOptions}
                  onOptionSelect={handleOptionSelect}
                  onOptionSkip={handleOptionSkip}
                />
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {uploadedImages.length === 0
                    ? "Attach product images or share a link"
                    : `${uploadedImages.length} image${uploadedImages.length > 1 ? "s" : ""} uploaded`}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop sidebar - only show when messages exist */}
      {sidebarOpen && !isEmpty && (
        <aside className="hidden lg:flex w-80 shrink-0 flex-col border-l bg-muted/30 overflow-y-auto">
          <ChatSidebar
            uploadedImages={uploadedImages}
            photoOptions={effectivePhotoOptions}
            onPhotoOptionChange={(key, value) => {
              setSidebarOverrides((prev) => ({ ...prev, [key]: value }));
            }}
          />
        </aside>
      )}

      {/* Mobile overlay sidebar */}
      {sidebarOpen && !isEmpty && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-80 max-w-[85vw] bg-background border-l shadow-xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <ChatSidebar
              uploadedImages={uploadedImages}
              photoOptions={effectivePhotoOptions}
              onPhotoOptionChange={(key, value) => {
                setSidebarOverrides((prev) => ({ ...prev, [key]: value }));
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
