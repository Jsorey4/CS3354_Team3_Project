## To-Dos


## Deadlines


## General Features
1. Ability to choose between School/Personal/Work projects (see subsections below for more details)
2. Calendar in app, with ability to connect to the other calendars (i.e. iCal, Google Cal, Outlook Cal)
3. Cost per project stage, that will sum to total project cost
	1. This will also track bid hours, total hours, hours per stage, etc.
4. Efficiency tracking
	1. Hours user spent with each task
	2. Timer to track time (similar to the one at KPMG)
	3. This will probably have visuals (charts/graphs)
5. Export to Excel/Google Sheets
6. Connect to email in order to send follow up email relating to task/project
	1. Ability to schedule emails as well
7. Ideas pulled straight from GitHub:
	1. Comments & Replies for tasks (markdown formatting)
	2. Assign task to users
		1. Ability to `@` a user
	3. Tags/Categories for tasks/projects
	4. Notifications/Reminders
	5. Due Dates
	6. Allow for choice of project management philosophy
8. Different permissions for different users (i.e. Admin/Partner/Manager/Staff)
	1. Partner should see all of their projects, managers, and staff
		1. Managers should see all of their projects, and staff
			1. Staff should just see their own performance
	2. Partners/Managers should see bid hours, current hours, hourly rates, total team performance as well as the performance of individuals (probably a drop down menu)
9. Soft Deadline adder?
    - assign soft deadlines to certain members
    - allow users to check off if theyve completed their specific soft deadline
    - could connect to the calendar linkage

## Ideas
1. Chat feature in app
2. AI Implementations

## APIs
1. AppleKit - iCal compatibility
2. Google - Google Calendar and gmail
3. Microsoft - Outlook and Outlook Calendar
4. Markdown flavor (which one?)

## Questions
1. Which Database?
2. Which markdown flavor?
3. How/where are we hosting?

## Documentation
Planning on this being in a markdown file with the following format (subject to change)
```markdown
## Front-end
### Overview
### Tech Stack
### Project Structure

## Back-end
### API
#### Endpoints
#### Authentication
#### Error Handling
### Database
#### Schema
#### Relationships
#### Migrations
```

### Flowchart
I'm a visual person so I thought about also creating a flowchart using `drawio`. I think it will also look good for a school project and shows understanding of what is going on in the project.


## Project Assignment 2

### Objectives

#### SE document: 
- [ ] Create the complete section framework
- [ ] Populate the blue sections—header page, table of contents, introduction, requirements, system modeling, and glossary

#### Requirements: 
- [ ] Explain the gathering approach in one, or two, paragraphs
- [ ] Create 30+ functional reqs, credit their author
- [ ] Create 10+ non-functional reqs, credit their author

##### Functional Requirements
1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
9. 
10. 
11. 
12. 
13. 
14. 
15. 
16. 
17. 
18. 
19. 
20. 
21. 
22. 
23. 
24. 
25. 
26. 
27. 
28. 
29. 
30. 

##### Nonfunctional Requirements
1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
9. 
10. 

#### Use cases: 
- [ ] List 2–3 per member
- [ ] Create a requirements-to-use-case traceability matrix (Jon)

#### Models: 
Per team-member:
- [ ] 2 use-case diagrams
- [ ] 2 high-level use-case diagrams, and 
- [ ] 2 expanded use-case diagrams 
- [ ] Diagram with at least two include and two extend use cases.

#### Sitemap: 
- [x] Turn the proposed screens and navigation into a sitemap.

#### Presentation: 
Include cost/price/margin, requirement summaries, use cases, traceability, diagrams, and sitemap; update the action register on the last slide.

### Consolidated project feature ideas

**1. Project management and organization**
- A central hub showing active projects.
- Project information: name, description, owner, status, delivery date, and assigned team members.
- Project cards showing tags, upcoming deadlines, outstanding tasks, and assigned people.
- Customizable project-card layouts and displayed information.
- Drag-and-drop project ordering and user-selected color coding.
- Individual project pages combining deadlines, assignments, tasks, to-dos, and authorized cost information.
- School/work project modes that enable or disable relevant features.
- A choice of project management methodology; supported methods remain undecided.

**2. Task management**
- Personal and team to-do lists.
- Task titles, descriptions, statuses, priorities, and due dates.
- Assign tasks to users and mention users with `@`.
- Organize tasks into named lists and tags/categories.
- Order tasks and lists.
- Record task completion.
- Markdown comments and replies on tasks.
- Notifications and reminders.

Shwat’s diagram supports task status, priority, assignment, ordering, due dates, and completion timestamps; my notes add the collaboration and notification ideas.

**3. Progress tracking and feature clarity** (Myo)
- Show overall project completion, such as “40% complete.”
- Show completion progress for individual features.
- Identify which features should be prioritized for deployment.
- Clearly describe each feature and its intended purpose so team members share the same understanding.
- Place progress tracking within tasks, the calendar, or a dedicated area.

Open decisions: how completion percentages are calculated and where progress tracking belongs.

**4. Time tracking and efficiency reporting**
- A timer for recording time spent on tasks.
- Time records linked to a project, task, and user.
- Start/end times, duration, and notes for time entries.
- Track estimated/bid hours, assigned hours, and actual logged hours.
- Charts and graphs showing project statistics and efficiency.
- Managers can review individual and team performance.
- Employees/associates can review their own performance.
- Managers can review each person’s logged hours by project.

**5. Budgets, costs, and expenses**
- Track project bid amounts, budgets, and current costs.
- Track costs by project stage for bidding and ongoing monitoring.
- Include hourly-rate information in authorized management views.
- Display project costs in a table with filtering, sorting, and search.
- Record project expenses, including category, description, amount, and spending date.
- Restrict sensitive financial information according to permissions.

Expense records are an addition visible in Shwat’s diagram.

**6. Calendar and scheduling**
- An in-app calendar with day, week, and month views.
- Show tasks/to-dos and project deadlines.
- Project events with titles, descriptions, start/end times, and an all-day option.
- Work with external calendars: Apple/iCal, Google, and Outlook.

The extent of external integration—import, export, or synchronization—still needs to be defined.

**7. People, teams, and permissions**
- Project membership and roles.
- Different views and permissions for managers and employees/associates.
	- Different features and views for when it's a school/personal project as well
- See which employees are assigned to which projects.
- A people directory containing project-related contacts, potentially including clients and firm personnel.
- A visual team hierarchy.
- Person detail pages showing name, title, email, projects, assigned hours, logged hours, tasks, and to-dos.
- Decide which people information employees can access.

**8. Accounts and profiles**
- Login/account access.
- User profiles with username, display name, and avatar.
- Profile access from the sidebar.

Shwat’s diagram suggests these account features; the authentication behavior still needs to be specified.

**9. Personalized dashboard and navigation**
- A homepage with a personalized greeting.
- Configurable dashboard widgets.
- Drag-and-drop widget arrangement.
- Quick access to selected projects, to-dos, costs, or other relevant information.
- Sidebar navigation for projects, tasks, charts, costs, people, calendar, and profile.
- Task navigation options for priorities, assignments, and lists, as suggested by Shwat’s sidebar sketch.

**10. Communication and integrations**
- Connect email for task follow-up messages.
- Schedule follow-up emails.
- Export information to Excel or Google Sheets.
- Possible AI features; no specific AI behavior has been defined.

Chat and AI were explicitly exploratory ideas.

**11. Project content and templates** 
- Markdown documentation.
- Possible flowchart support, with draw.io mentioned.
- Project-linked content pages with titles and content.
- Reusable templates with names, descriptions, and content.
- A public/private template setting suggested by Shwat’s diagram.

The pages/templates concept comes from Shwat’s diagram. Whether Markdown documentation and flowcharts are application features or tools for preparing the team’s own documentation needs clarification.

**12. Accessibility**
- Color-blindness settings.
- Coordinate customizable color coding with accessibility needs.
- Light/dark mode

**Technical decisions still open**
- Hosting approach.
- External-service APIs and registration requirements.
- Supported project management methods.
- Definitions of progress, efficiency, and completion.
- Which ideas belong in the first release versus later versions.
