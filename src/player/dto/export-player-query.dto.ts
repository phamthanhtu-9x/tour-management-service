import { PickType } from '@nestjs/swagger';
import { SearchPlayerQueryDto } from './search-player-query.dto';

/** Query export Excel: chỉ nhận `search` (không phân trang). */
export class ExportPlayerQueryDto extends PickType(SearchPlayerQueryDto, [
  'search',
] as const) {}
