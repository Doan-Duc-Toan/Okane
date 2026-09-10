import { IsDateString, IsDecimal, IsOptional, Length } from 'class-validator';

// `currency` is deliberately omitted: a goal's currency is immutable after
// creation (changing it would invalidate every frozen conversion already
// stored against it — see docs/data-model.md). With `forbidNonWhitelisted`
// on the global ValidationPipe, a client that sends `currency` here gets an
// automatic 400 rather than a silently ignored field.
export class UpdateGoalDto {
  @IsOptional()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  targetAmount?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
