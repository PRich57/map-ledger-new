# Pages

**Purpose**    
Routeable React pages served by the router.

## Key Exports
| Name | Type | Description |
|------|------|-------------|
| Login | component | User authentication screen |
| Dashboard | component | Main overview page |
| Clients | component | Manage client profiles |
| Users | component | Admin user management |

## Runbook Cross-References
§8 UX, §3 System Architecture

## TODO (owner: @unassigned)
1. Add screenshot references

## Patterns
- Route guards redirect authenticated users away from `/login` to the dashboard.
