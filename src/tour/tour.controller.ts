import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MyJwtGuard } from '../auth/guard';
import { TourService } from './tour.service';
import { GetUser } from '../auth/decorator';
import { InsertTourDto } from './dto';
import { UpdateTourDto } from './dto/update.tour.dto';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Tours')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('tours')
export class TourController {
  constructor(private tourService: TourService) {}
  @ApiOperation({
    summary: 'Lấy danh sách các Tour của người dùng (Có phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get()
  getTours(@GetUser('id') userId: number, @Query() query: PaginationQueryDto) {
    return this.tourService.getTours(userId, query);
  }

  @Get(':id')
  getTourById(@Param('id', ParseIntPipe) tourId: number) {
    return this.tourService.getTourById(tourId);
  }

  @Post()
  insertTour(
    @GetUser('id') userId: number,
    @Body() insertTourDto: InsertTourDto,
  ) {
    return this.tourService.insertTour(userId, insertTourDto);
  }

  @Patch(':id')
  updateTour(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
    @Body() updateTourDto: UpdateTourDto,
  ) {
    return this.tourService.updateTour(userId, tourId, updateTourDto);
  }

  @Delete(':id/delete')
  deleteTour(@Param('id', ParseIntPipe) tourId: number) {
    return this.tourService.deleteTour(tourId);
  }
}
