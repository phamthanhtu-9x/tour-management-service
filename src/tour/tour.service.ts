import { ForbiddenException, Injectable } from '@nestjs/common';
import { InsertTourDto, UpdateTourDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import { PaginatedResource } from 'src/common/interfaces/paginated-res.interface';

@Injectable()
export class TourService {
  constructor(private prismaService: PrismaService) {}
  async getTours(
    userId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResource<any>> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [tours, totalItems] = await this.prismaService.$transaction([
      this.prismaService.tour.findMany({
        where: {
          userId,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.tour.count({
        where: {
          userId,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items: tours,
      meta: {
        totalItems,
        itemCount: tours.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getTourById(tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });
    return tour;
  }

  async insertTour(userId: number, insertTourDto: InsertTourDto) {
    const tour = await this.prismaService.tour.create({
      data: {
        ...insertTourDto,
        userId,
      },
    });

    return tour;
  }

  async updateTour(
    userId: number,
    tourId: number,
    updateTourDto: UpdateTourDto,
  ) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });

    if (!tour) {
      throw new ForbiddenException('Tour not found to update');
    }

    return await this.prismaService.tour.update({
      where: {
        id: tourId,
      },
      data: {
        ...updateTourDto,
      },
    });
  }

  async deleteTour(tourId: number) {
    const tour = await this.prismaService.tour.findUnique({
      where: {
        id: tourId,
      },
    });

    if (!tour) {
      throw new ForbiddenException('Tour not found to delete');
    }

    return await this.prismaService.tour.delete({
      where: {
        id: tourId,
      },
    });
  }
}
