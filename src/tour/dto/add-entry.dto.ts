import { OmitType } from '@nestjs/swagger';
import { PlayerEntryDto } from './player-entry.dto';

/** Body thêm một entry mới – id do server sinh. */
export class AddEntryDto extends OmitType(PlayerEntryDto, ['id'] as const) {}
