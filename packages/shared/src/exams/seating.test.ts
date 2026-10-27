import { describe, expect, it } from 'vitest';
import { hallCapacity, hallFromRoom, type RoomForHall } from './seating';

const room: RoomForHall = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'G11',
  floor: 0,
  isAccessible: true,
  rows: 12,
  seatsPerRow: 6,
  examSeatsPerBench: 1,
};

describe('rooms as exam halls', () => {
  it('turns two-seater class benches into exam benches', () => {
    const hall = hallFromRoom(room, 3);
    expect(hall).toEqual({
      id: room.id,
      code: 'G11',
      floor: 0,
      isAccessible: true,
      rows: 12,
      benchesPerRow: 3,
      seatsPerBench: 1,
      order: 3,
    });
    expect(hallCapacity(hall!)).toBe(36);
  });

  it('rounds an odd seat count up to a whole bench', () => {
    expect(hallFromRoom({ ...room, seatsPerRow: 5, examSeatsPerBench: 2 }, 0)?.benchesPerRow).toBe(
      3,
    );
  });

  it('skips rooms without exam seats', () => {
    expect(hallFromRoom({ ...room, examSeatsPerBench: null }, 0)).toBeNull();
    expect(hallFromRoom({ ...room, examSeatsPerBench: 0 }, 0)).toBeNull();
    expect(hallFromRoom({ ...room, rows: null }, 0)).toBeNull();
  });
});
