import { Body, Controller, Post } from '@nestjs/common';
import { ParsePgnDto } from './dto/parse-pgn.dto';
import { PgnService } from './pgn.service';
import type { ParsedPgn } from './pgn.service';

@Controller('pgn')
export class PgnController {
  constructor(private readonly pgnService: PgnService) {}

  @Post('parse')
  parse(@Body() body: ParsePgnDto): ParsedPgn {
    return this.pgnService.parse(body?.pgn);
  }
}
