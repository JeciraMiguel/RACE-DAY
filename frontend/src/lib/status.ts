import type { EventStatus, PaymentStatus, RegistrationStatus, ResultStatus } from './types';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export const eventStatusTone: Record<EventStatus, Tone> = {
  Draft: 'neutral',
  Published: 'success',
  Cancelled: 'danger',
  Completed: 'info',
};

export const registrationStatusTone: Record<RegistrationStatus, Tone> = {
  Confirmed: 'success',
  Cancelled: 'danger',
};

export const paymentStatusTone: Record<PaymentStatus, Tone> = {
  Pending: 'warning',
  Paid: 'success',
  Waived: 'info',
};

export const resultStatusTone: Record<ResultStatus, Tone> = {
  Finished: 'success',
  DNF: 'warning',
  DNS: 'neutral',
  DSQ: 'danger',
};
