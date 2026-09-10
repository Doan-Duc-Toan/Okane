import { IsDateString, IsDecimal, IsOptional, Length } from 'class-validator';

// `currency` is deliberately omitted: a goal's currency is immutable after
// creation (changing it would invalidate every frozen conversion already
// stored against it — see docs/data-model.md). With `forbidNonWhitelisted`
// on the global ValidationPipe, a client that sends `currency` here gets an
// automatic 400 rather than a silently ignored field.
// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see register.dto.ts.
export class UpdateGoalDto {
  @IsOptional()
  @Length(1, 80, { message: 'goalNameInvalid' })
  name?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'goalTargetAmountInvalid' })
  targetAmount?: string;

  @IsOptional()
  @IsDateString({}, { message: 'goalDeadlineInvalid' })
  deadline?: string;
}
