import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const source = searchParams.get('source')

    const skip = (page - 1) * limit

    const where = source ? { source } : {}

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
    ])

    return NextResponse.json({
      articles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching articles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch articles' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, link, content, source } = body

    if (!title || !link || !content || !source) {
      return NextResponse.json(
        { error: 'Missing required fields: title, link, content, source' },
        { status: 400 }
      )
    }

    // Check if article already exists
    const existingArticle = await prisma.article.findUnique({
      where: { link },
    })

    if (existingArticle) {
      return NextResponse.json(
        { error: 'Article with this link already exists' },
        { status: 409 }
      )
    }

    const article = await prisma.article.create({
      data: {
        title,
        link,
        content,
        source,
      },
    })

    return NextResponse.json(article, { status: 201 })
  } catch (error) {
    console.error('Error creating article:', error)
    return NextResponse.json(
      { error: 'Failed to create article' },
      { status: 500 }
    )
  }
}
