import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const source = searchParams.get('source') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (query.trim()) {
      // Prioritize title matches, then content
      where.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive'
          }
        },
        {
          content: {
            contains: query,
            mode: 'insensitive'
          }
        }
      ];
    }

    if (source) {
      where.source = source;
    }

    // Get total count for pagination
    const total = await prisma.article.count({ where });

    // Get articles with pagination
    // For search queries, we'll prioritize by relevance (title matches first, then content)
    // Since SQLite doesn't have full-text search, we'll sort by creation date
    // In a production app with PostgreSQL, we could use full-text search ranking
    const articles = await prisma.article.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit,
    });

    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      articles,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    });
  } catch (error) {
    console.error('Search articles error:', error);
    return NextResponse.json(
      { error: 'Failed to search articles' },
      { status: 500 }
    );
  }
}
