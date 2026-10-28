export type LatLng = { lat: number; lng: number };

export type Category = "cafe" | "restaurant" | "gym" | "dessert" | "park" | "mall";

/** Tags we only attach when the data source supports them (never assumed). */
export type PlaceTag = "quiet" | "outdoor" | "family" | "budget" | "work" | "late";

export type Place = {
  id: string;
  name: string;
  category: Category;
  location: LatLng;
  address: string;
  district?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number; // 1-4
  photoUrl?: string;
  tags: PlaceTag[];
  summary?: string;
  openNow?: boolean;
  source: "google" | "demo";
};

export type Priority = "distance" | "rating" | "balanced";

/** One stop the user asked for, in order. */
export type StepSpec = {
  category: Category;
  query?: string; // free text, e.g. "كوفي مختص"
  placeName?: string; // user named a specific place
  tags?: PlaceTag[];
  mealTime?: "lunch" | "dinner";
};

export type PlanStop = {
  step: StepSpec;
  place: Place;
  alternatives: Place[];
  excluded: string[]; // place ids the user rejected for this step
  locked: boolean;
  reason: string;
  distanceFromPrevKm?: number;
  anchorLabel: string; // "موقعك" / "النادي" ...
};

export type RouteLeg = { distanceMeters: number; durationSeconds: number };

export type RouteResult = {
  path: LatLng[];
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
  source: "google" | "demo";
};

export type Plan = {
  id: string;
  origin: LatLng;
  originLabel: string;
  priority: Priority;
  stops: PlanStop[];
  route?: RouteResult;
  startedAt?: string;
};

export type Preferences = {
  consent: boolean;
  likes: PlaceTag[];
  avoid: string[]; // free-form avoid notes like "crowded"
  minRating?: number;
  notes: string[];
};

export type ClarifyOption = { label: string; value: string };

/** What the assistant decided to do with a user message. */
export type AssistantAction =
  | { type: "clarify"; question: string; options: ClarifyOption[]; pending: Partial<ParsedRequest> }
  | { type: "plan"; request: ParsedRequest }
  | { type: "modify"; op: "replace" | "lock" | "unlock" | "remove"; index: number }
  | { type: "add"; step: StepSpec }
  | { type: "chat" };

export type ParsedRequest = {
  steps: StepSpec[];
  district?: string;
  priority?: Priority;
  tags: PlaceTag[];
};

export type AssistantResponse = { reply: string; action: AssistantAction; engine: "groq" | "rules" };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  options?: ClarifyOption[];
  places?: Place[]; // recommendation cards attached to a reply
};

export type Review = {
  id: string;
  placeId: string;
  placeName: string;
  rating: number;
  experience: "excellent" | "average" | "bad";
  reasons: string[];
  body: string;
  createdAt: string;
  userId: string;
};

export type Visit = {
  placeId: string;
  placeName: string;
  category: Category;
  planId: string;
  status: "pending" | "visited" | "skipped" | "reviewed";
};
