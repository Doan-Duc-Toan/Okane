import { IsIn, IsOptional } from 'class-validator';

export type HistoryRange = '7d' | '30d' | '1y';
export const HISTORY_RANGES: HistoryRange[] = ['7d', '30d', '1y'];

// A raw query-param string is never interpolated straight into a date
// computation — it must land in this enum-validated set first.
export class HistoryQueryDto {
  @IsOptional()
  @IsIn(HISTORY_RANGES)
  range: HistoryRange = '7d';
}
