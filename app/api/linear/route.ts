import { NextResponse } from 'next/server'

const LINEAR_API_KEY = process.env.LINEAR_API_KEY
const TEAM_ID = 'c2323d89-d864-41a4-ba25-295155e14e7d'

const QUERY = `
  query GetTeamIssues($teamId: String!) {
    team(id: $teamId) {
      issues(
        filter: {
          state: { type: { nin: ["completed", "canceled"] } }
        }
        orderBy: updatedAt
        first: 50
      ) {
        nodes {
          id
          identifier
          title
          priority
          url
          updatedAt
          description
          state {
            id
            name
            color
            type
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          assignee {
            name
            avatarUrl
          }
        }
      }
    }
  }
`

export async function GET() {
  if (!LINEAR_API_KEY) {
    return NextResponse.json({ error: 'LINEAR_API_KEY not configured' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: LINEAR_API_KEY,
      },
      body: JSON.stringify({ query: QUERY, variables: { teamId: TEAM_ID } }),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Linear API error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()

    if (data.errors) {
      return NextResponse.json({ error: data.errors[0].message }, { status: 400 })
    }

    const issues = data?.data?.team?.issues?.nodes ?? []
    return NextResponse.json(issues)
  } catch (err) {
    console.error('[linear route] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch Linear issues' }, { status: 500 })
  }
}
