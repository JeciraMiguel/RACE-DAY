// Mirrors the DTOs of RaceDayApi.Contracts (JSON, camelCase, enums as strings).

export type Role = 'Participant' | 'Organizer' | 'Admin';
export type Gender = 'Male' | 'Female' | 'Other';
export type EventStatus = 'Draft' | 'Published' | 'Cancelled' | 'Completed';
export type RegistrationStatus = 'Confirmed' | 'Cancelled';
export type PaymentStatus = 'Pending' | 'Paid' | 'Waived';
export type ResultStatus = 'Finished' | 'DNF' | 'DNS' | 'DSQ';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AuthResponse {
  token: string;
  email: string;
  role: Role;
  refreshToken: string;
  expiresAt: string;
}

export interface Profile {
  userId: number;
  fullName: string;
  email: string;
  role: Role;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  phone?: string | null;
}

export interface RaceEvent {
  eventId: number;
  title: string;
  description: string;
  eventDate: string;
  venueId: number;
  venueName: string;
  imageUrl: string | null;
  status: EventStatus;
  organizerId: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  /** Aggregates for event cards (list endpoint only; 0/null elsewhere). */
  categoryCount: number;
  minEntryFee: number | null;
  /** Remaining spots, or null when nothing limits the event. */
  spotsLeft: number | null;
  /** Confirmed registrations across all categories (list endpoint only). */
  registeredCount: number;
}

export interface Category {
  categoryId: number;
  name: string;
  entryFee: number;
  eventId: number;
  distanceKm: number | null;
  startTime: string | null;
  maxParticipants: number | null;
  minAge: number | null;
  maxAge: number | null;
  gender: Gender | null;
  registeredCount: number;
  spotsLeft: number | null;
}

export interface EventDetail extends RaceEvent {
  categories: Category[];
}

export interface Venue {
  venueId: number;
  name: string;
  location: string;
  city: string | null;
  description: string | null;
  capacity: number;
  /** IANA time zone; event times are local to the venue. */
  timeZone: string | null;
}

export interface Registration {
  registrationId: number;
  categoryId: number;
  categoryName: string;
  eventId: number;
  eventTitle: string;
  participantName: string;
  raceNumber: number;
  registrationDate: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  eventDate: string;
  eventStatus: EventStatus;
  entryFee: number;
  hasResult: boolean;
  /** Server verdict: the caller may still cancel this registration. */
  canCancel: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  raceNumber: number;
  participantName: string;
  categoryName: string;
  finishTime: string;
}

export interface UserSummary {
  userId: number;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface ResultRow {
  resultId: number;
  registrationId: number;
  categoryId: number;
  categoryName: string;
  raceNumber: number;
  participantName: string;
  status: ResultStatus;
  finishTime: string | null;
  rank: number | null;
}

export interface MyResult {
  resultId: number;
  registrationId: number;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  categoryId: number;
  categoryName: string;
  raceNumber: number;
  status: ResultStatus;
  finishTime: string | null;
  rank: number | null;
  /** How many finished in the category. */
  finishers: number;
}

export interface UpdateProfileInput {
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface Participant {
  registrationId: number;
  participantName: string;
  email: string;
  phone: string | null;
  categoryId: number;
  categoryName: string;
  raceNumber: number;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  registrationDate: string;
}

export interface Stats {
  eventsByStatus: Record<EventStatus, number>;
  users: number;
  confirmedRegistrations: number;
  resultsRecorded: number;
}

export interface ImportSummary {
  imported: number;
  errors: { line: number; message: string }[];
}

export interface CategoryInput {
  name: string;
  entryFee: number;
  distanceKm: number | null;
  startTime: string | null;
  maxParticipants: number | null;
  minAge: number | null;
  maxAge: number | null;
  gender: Gender | null;
}

export interface VenueInput {
  name: string;
  location: string;
  city: string | null;
  description: string | null;
  capacity: number;
  timeZone: string | null;
}
