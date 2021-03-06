import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { EnumCategoryName } from 'src/common/constants';

@Injectable()
export class CategoryValidationPipe implements PipeTransform {
  transform(value: EnumCategoryName, metadata: ArgumentMetadata) {
    if (!metadata || !this.toValidate(value))
      throw new BadRequestException('잘못된 카테고리입니다');

    return value;
  }
  private toValidate(value: EnumCategoryName) {
    const category = [
      EnumCategoryName.ANNOUNCEMENT,
      EnumCategoryName.FREEBOARD,
      EnumCategoryName.GENERAL,
      EnumCategoryName.INFORMATION,
      EnumCategoryName.POPULAR,
    ];
    for (const ct of category) {
      if (ct === value) return true;
    }
    return false;
  }
}
