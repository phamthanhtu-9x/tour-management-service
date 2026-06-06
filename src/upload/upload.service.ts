import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  handleUpload(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file để tải lên');
    }

    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
    };
  }
}
