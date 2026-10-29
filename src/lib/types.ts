export type LatLng = { lat: number; lng: number };

export type Category =
  | "cafe"
  | "restaurant"
  | "gym"
  | "dessert"
  | "park"
  | "mall"
  | "entertainment"
  | "laundry"
  | "mosque"
  | "sports"
  | "education"
  | "transport"
  | "government";

export type Subcategory =
  | "italian"
  | "fast_food"
  | "burger"
  | "pizza"
  | "saudi"
  | "shawarma"
  | "indian"
  | "asian"
  | "seafood"
  | "grill"
  | "specialty_coffee"
  | "quiet"
  | "study"
  | "drive_thru"
  | "fitness"
  | "women"
  | "bakery"
  | "ice_cream"
  | "public_park"
  | "shopping"
  | "games"
  | "car_wash"
  | "clothes_laundry"
  | "mosque"
  | "football"
  | "padel"
  | "primary_school"
  | "secondary_school"
  | "university"
  | "academy"
  | "metro_station"
  | "ministry";

/** How far a place's coordinates can be trusted: OpenStreetMap-verified, approximate, or made up for the demo. */
export type LocationStatus = "verified" | "approximate" | "synthetic";

/** Tags we only attach when the data source supports them (never assumed). */
export type PlaceTag = "quiet" | "outdoor" | "family" | "budget" | "work" | "late";

export type Place = {
  id: string;
  name: string;
  category: Category;
  subcategory?: Subcategory;
  location: LatLng;
  address: string;
  district?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number; // 1-4
  photoUrl?: string; // a real photo of this venue (Google / image_url)
  tags: PlaceTag[];
  labels?: string[]; // raw Arabic tags from the database
  summary?: string;
  openNow?: boolean;
  hours?: string;
  source: "supabase" | "google" | "demo";
  isDemo: boolean; // synthetic record — always labelled in the UI
  locationStatus: LocationStatus;
  locationSource?: string; // e.g. "openstreetmap", "synthetic", "google"
};

export type Priority = "distance" | "rating" | "balanced";

/** One stop the user asked for, in order. */
export type StepSpec = {
  category: Category;
  subcategory?: Subcategory;
  placeName?: string; // user named a specific place
  tags?: PlaceTag[];
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

export type RouteLeg = { distanceMeters: number; durationSeconds?: number };

/** One basic guidance instruction from the routing service. */
export type NavStep = { text: string; distanceMeters: number };

export type RouteResult = {
  path: LatLng[];
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds?: number; // only when a routing service returned it — never estimated
  source: "google" | "osrm" | "straight_line";
  steps?: NavStep[];
  error?: string; // why road routing failed, when we fell back to straight lines
};

export type Plan = {
  id: string;
  origin: LatLng;
  originLabel: string;
  district?: string;
  priority: Priority;
  stops: PlanStop[];
  route?: RouteResult;
  startedAt?: string;
  tags?: PlaceTag[]; // plan-wide tags it was built with ("هادي", "أسعار مناسبة")
  goal?: string; // the user's words that created this plan, so later edits can go back to the original idea
};

export type Preferences = {
  consent: boolean;
  likes: PlaceTag[];
  avoid: string[]; // free-form avoid notes like "crowded"
  minRating?: number;
  notes: string[];
  neighborhoods: string[];
  cuisines: Subcategory[]; // preferred restaurant subcategories
  cafeTypes: Subcategory[];
  budget?: "low" | "any";
  distance?: Priority; // default ranking when the user does not say
};

export type ClarifyOption = { label: string; value: string };

/** What the assistant decided to do with a user message. */
export type AssistantAction =
  | { type: "clarify"; question: string; options: ClarifyOption[]; pending: Partial<ParsedRequest> }
  | { type: "plan"; request: ParsedRequest }
  | {
      type: "modify";
      op: "replace" | "lock" | "unlock" | "remove";
      index: number;
      /** replace only: new spec for that stop, e.g. a different cuisine or a different activity */
      step?: Partial<StepSpec>;
      nearer?: boolean; // "أبي كوفي أقرب"
      onlyThis?: boolean; // "غير المطعم بس" — keep the stops after it
    }
  | { type: "add"; step: StepSpec; after?: number } // insert after this stop index; default: end
  /** Same activities and count, a different place for every unlocked stop (all of them with includeLocked). */
  | { type: "replace_all"; includeLocked?: boolean }
  /** A different itinerary built from the original goal; none of the current places are reused when others exist. */
  | { type: "regenerate"; request?: ParsedRequest; includeLocked?: boolean }
  /** Rebuild the unlocked stops under changed plan-wide constraints. */
  | { type: "constraints"; edit: ConstraintEdit }
  | { type: "undo" } // restore the plan before the last change
  | { type: "chat" };

/** Plan-wide corrections ("أرخص", "أهدأ", "خليها بالملقا", "أبي أماكن تناسب البنات"). */
export type ConstraintEdit = {
  district?: string;
  priority?: Priority;
  addTags?: PlaceTag[];
  removeTags?: PlaceTag[];
  women?: boolean; // women-only gyms
  nearer?: boolean; // keep every hop as short as the data allows
};

export type ParsedRequest = {
  steps: StepSpec[];
  district?: string;
  priority?: Priority;
  tags: PlaceTag[];
};

/** Stable tastes the user stated in chat ("ما أحب الزحمة"); saved only with consent. */
export type PreferenceUpdate = Partial<Pick<Preferences, "likes" | "avoid" | "neighborhoods" | "cuisines" | "cafeTypes" | "budget" | "distance">>;

export type AssistantResponse = {
  reply: string;
  action: AssistantAction;
  engine: "gemini" | "rules";
  learned?: PreferenceUpdate;
  fallback?: "quota" | "unavailable" | "invalid"; // why Gemini was not used for this turn
};

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
  storage: "supabase" | "local";
};

export type Visit = {
  placeId: string;
  placeName: string;
  category: Category;
  subcategory?: Subcategory;
  district?: string;
  source: Place["source"];
  planId: string;
  status: "pending" | "visited" | "skipped" | "reviewed";
};
