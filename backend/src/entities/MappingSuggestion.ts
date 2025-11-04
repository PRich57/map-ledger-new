import { Entity as Company, PrimaryGeneratedColumn, Column } from 'typeorm';

@Company()
export class MappingSuggestion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  description!: string;
}
