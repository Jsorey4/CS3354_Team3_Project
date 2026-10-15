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

Classification follows `PPTS/Ch6_Requirements.pdf`, slides 24–26: functional requirements describe services, actions, outputs, and behavior under specified conditions, including actions available to different roles. Slides 29–40 describe nonfunctional requirements as quality, process, and external constraints; slide 30 requires verifiable wording.

These are draft requirements extracted from the existing ideas, not an approved first-release scope. Source numbers refer to the numbered sections in **Consolidated project feature ideas** below. Each requirement's author is **TBD unless explicitly credited**. A source identifies where an idea was recorded; it does not establish who authored the final requirement. Credits to Myo or Shwat reflect the existing notes and still need team confirmation. Any **TBD** decision must be resolved before the affected requirement is ready for acceptance testing.

1. The system shall display a central hub listing the user's active projects. (Source: 1.)
2. The system shall allow authorized users to record a project's name, description, owner, status, delivery date, and assigned team members. (Source: 1.)
3. The system shall display project cards containing tags, upcoming deadlines, outstanding tasks, and assigned people. (Source: 1.)
4. The system shall allow users to customize project-card layouts and choose which project information is displayed. (Source: 1; available layouts and fields: **TBD**.)
5. The system shall allow users to reorder project cards by dragging and dropping them. (Source: 1.)
6. The system shall allow users to select color coding for their projects. (Sources: 1, 12.)
7. The system shall display a project page combining its deadlines, assignments, tasks, to-dos, and cost information that the current user is authorized to view. (Source: 1.)
8. The system shall allow a user to choose school, personal, or work mode for a project and enable the features assigned to that mode. (Sources: General Features 1; 1, 7; mode-to-feature mapping: **TBD**.)
9. The system shall allow users to maintain personal and team to-do lists. (Source: 2.)
10. The system shall allow authorized users to create and edit tasks with a title, description, status, priority, and due date. (Sources: 2; README, Task Management. Shwat is credited for the diagram's status, priority, and due-date ideas.)
11. The system shall allow authorized users to assign tasks to project members. (Source: 2; also attributed to Shwat's diagram.)
12. The system shall allow users to mention another user with `@` in task discussions. (Sources: General Features 7; 2.)
13. The system shall allow users to organize tasks into named lists and apply tags or categories to tasks and projects. (Sources: General Features 7; 1, 2.)
14. The system shall allow users to change the order of tasks and task lists. (Source: 2; also attributed to Shwat's diagram.)
15. The system shall record a task's completion status and completion timestamp when it is marked complete. (Source: 2; credited to Shwat's diagram.)
16. The system shall allow users to add Markdown-formatted comments and replies to tasks. (Source: 2; supported Markdown flavor: **TBD**.)
17. The system shall notify users about relevant task/project events and remind them of approaching deadlines. (Sources: General Features 7; 2; triggers, recipients, channels, and reminder timing: **TBD**.)
18. The system shall allow users to assign soft deadlines to specific project members and allow those members to mark their assigned soft deadlines complete. (Source: General Features 9.)
19. The system shall display an overall project completion percentage. (Source: 3; credit: Myo; calculation rule: **TBD**.)
20. The system shall display completion progress for individual project features. (Source: 3; credit: Myo; calculation rule: **TBD**.)
21. The system shall allow users to identify project features as priorities for deployment. (Source: 3; credit: Myo; prioritization scheme: **TBD**.)
22. The system shall allow users to record and view a description and intended purpose for each project feature. (Source: 3; credit: Myo.)
23. The system shall provide a timer that users can start and stop to record time spent on a task. (Source: 4.)
24. The system shall store each time entry with its project, task, user, start time, end time, duration, and notes. (Source: 4.)
25. The system shall track estimated/bid hours, assigned hours, and actual logged hours for projects. (Sources: General Features 3; 4, 7.)
26. The system shall display charts and graphs of project statistics and efficiency. (Source: 4; metrics and efficiency formulas: **TBD**.)
27. The system shall allow authorized partners/managers to review individual and team performance and each person's logged hours by project. (Sources: General Features 8; 4.)
28. The system shall allow staff/employees/associates to review their own performance and prevent them from viewing other people's performance. (Sources: General Features 8; 4; role-name mapping: **TBD**.)
29. The system shall allow authorized users to record project bid amounts, budgets, and current costs. (Source: 5.)
30. The system shall track costs for each project stage and sum those costs to display the total project cost. (Sources: General Features 3; 5.)
31. The system shall display hourly rates in authorized management views. (Source: 5.)
32. The system shall display a project-cost table that authorized users can filter, sort, and search. (Source: 5; filter fields, sort keys, and searchable fields: **TBD**.)
33. The system shall allow authorized users to record project expenses with a category, description, amount, and spending date. (Source: 5; credited to Shwat's diagram.)
34. The system shall provide day, week, and month views of the in-app calendar. (Source: 6.)
35. The system shall display tasks, to-dos, and project deadlines in the in-app calendar. (Source: 6.)
36. The system shall allow users to record project events with a title, description, start time, end time, and all-day setting. (Source: 6.)
37. The system shall support exchanging project calendar information with Apple/iCal, Google Calendar, and Outlook Calendar. (Source: 6; import, export, or synchronization behavior and included records: **TBD**.)
38. The system shall support project membership and roles that determine which project information and actions a user can access. (Sources: General Features 8; 7; full permission matrix: **TBD**.)
39. The system shall show partners their projects, managers, and staff, and show managers their projects and staff. (Source: General Features 8.)
40. The system shall display which employees are assigned to each project. (Source: 7.)
41. The system shall provide a directory of project-related contacts. (Source: 7; inclusion of clients and firm personnel, and employee access: **TBD**.)
42. The system shall display the team's reporting hierarchy. (Source: 7; hierarchy relationships: **TBD**.)
43. The system shall display authorized person-detail pages containing name, title, email, projects, assigned hours, logged hours, tasks, and to-dos. (Source: 7; field visibility by role: **TBD**.)
44. The system shall allow users to log in to their accounts. (Source: 8; credited to Shwat's diagram; authentication method and success/failure behavior: **TBD**.)
45. The system shall provide user profiles containing a username, display name, and avatar. (Source: 8; credited to Shwat's diagram.)
46. The system shall display a personalized greeting on the homepage. (Source: 9.)
47. The system shall allow users to configure dashboard widgets for quick access to selected projects, to-dos, costs, and other permitted information. (Source: 9; available widgets: **TBD**.)
48. The system shall allow users to rearrange dashboard widgets by dragging and dropping them. (Source: 9.)
49. The system shall provide sidebar links to projects, tasks, charts, costs, people, the calendar, and the user's profile, subject to permissions. (Sources: 8, 9.)
50. The system shall provide task navigation by priority, assignment, and list. (Source: 9; credited to Shwat's sidebar sketch.)
51. The system shall allow users to connect an email account and send follow-up messages related to a task or project. (Source: 10; supported providers and account-connection behavior: **TBD**.)
52. The system shall allow users to schedule a task/project follow-up email for a selected sending time. (Source: 10; time-zone and failed-delivery behavior: **TBD**.)
53. The system shall allow users to export authorized project information to Excel or Google Sheets. (Source: 10; included fields, export formats, and file versus direct-service export: **TBD**.)
54. The system shall allow users to select color-blindness settings. (Source: 12; supported settings and their effects: **TBD**.)
55. The system shall allow users to switch between light and dark display modes. (Source: 12.)

##### Nonfunctional Requirements

Features such as choosing a theme, logging in, and assigning permissions are functional; the quality constraints that apply across those features belong here.

1. **Security/confidentiality (product):** The system shall prevent users from accessing financial and individual-performance information outside their assigned permissions through any application access path, including views, direct requests, and exports. 
	* **Basis:** General Features 8 and consolidated sections 4, 5, and 7. 
	* **Proposed verification:** Test permitted and prohibited access for each role against the same records. 
	* **Open:** Approve the role/field/action permission matrix; the broader enforcement wording is a refinement of the existing confidentiality idea.
2. **Accessibility (product):** Project and task information conveyed by user-selected colors shall remain distinguishable when the supported color-blindness settings are enabled, in both light and dark modes. 
	* **Basis:** Consolidated sections 1 and 12. 
	* **Proposed verification:** Check the supported color settings and themes, using text or other non-color cues for information otherwise conveyed only by color.
	* **Open:** Define supported color-vision needs, affected UI elements, and measurable readability criteria; non-color cues are a proposed acceptance detail.
3. **Calendar interoperability (external):** Calendar information exchanged through the approved integration shall retain the agreed event/task fields and date/time meaning when used with Apple/iCal, Google Calendar, and Outlook Calendar. 
	* **Basis:** General Features 2 and consolidated section 6. 
	* **Proposed verification:** Compare the agreed fields and dates/times before and after each supported exchange. 
	* **Open:** Define integration direction, supported versions/interfaces, field mapping, and time-zone/all-day handling.
4. **Spreadsheet interoperability (external):** Exported project information shall be readable in the supported versions of Excel and Google Sheets without losing or changing the selected field values.  
	* **Basis:** General Features 5 and consolidated section 10. 
	* **Proposed verification:** Open or retrieve an export in each target and compare its fields and values with the source records. 
	* **Open:** Define supported versions, included fields, format, and handling of dates, durations, and currency.

##### Requirements gaps and decisions

- **Possible NFR topics to discuss, not existing commitments:** 
	* Response time under a defined workload
	* Concurrent-user capacity
	* Availability
	* Backup/recovery
	* Browser/device support, and 
	* Usability measured through representative tasks. 

- **Scope:** The 55 entries are a draft pool. Select the first-release scope before promising all of them; integrations, reporting, and permissions need particular review for feasibility.

- **Ambiguity:** Resolve the inline TBDs, especially role names and permissions, school/personal/work behavior, progress and efficiency formulas, notification rules, authentication, and external integrations. Define relevant invalid-input and failure behavior as required by slides 25–26.

- **Deferred ideas:** Project management methodology selection needs a supported-method list. Chat and AI remain exploratory. Project content pages, reusable templates, and public/private template visibility (section 11, attributed to Shwat's diagram) need scope confirmation. Markdown documentation and draw.io may describe the team's documentation tools rather than application features. These ideas remain below but are not counted in the 55 functional requirements.

- **Classification:** Do not count light/dark mode or color-blindness settings alone as NFRs; those are user actions (FR-54–55). NFR-02 addresses the accessibility quality they must support. Likewise, FR-37/53 describe integrations, while NFR-03/04 constrain compatibility. Permission behavior is functional; NFR-01 states the confidentiality constraint across access paths.

- **Validation:** Slides 80–83 call for clear, consistent, bounded, and testable requirements.

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

#### 1. Project management and organization

- A central hub showing active projects.
- Project information: name, description, owner, status, delivery date, and assigned team members.
- Project cards showing tags, upcoming deadlines, outstanding tasks, and assigned people.
- Customizable project-card layouts and displayed information.
- Drag-and-drop project ordering and user-selected color coding.
- Individual project pages combining deadlines, assignments, tasks, to-dos, and authorized cost information.
- School/work project modes that enable or disable relevant features.
- A choice of project management methodology; supported methods remain undecided.

#### 2. Task management

- Personal and team to-do lists.
- Task titles, descriptions, statuses, priorities, and due dates.
- Assign tasks to users and mention users with `@`.
- Organize tasks into named lists and tags/categories.
- Order tasks and lists.
- Record task completion.
- Markdown comments and replies on tasks.
- Notifications and reminders.

Shwat’s diagram supports task status, priority, assignment, ordering, due dates, and completion timestamps; my notes add the collaboration and notification ideas.

#### 3. Progress tracking and feature clarity (Myo)

- Show overall project completion, such as “40% complete.”
- Show completion progress for individual features.
- Identify which features should be prioritized for deployment.
- Clearly describe each feature and its intended purpose so team members share the same understanding.
- Place progress tracking within tasks, the calendar, or a dedicated area.

Open decisions: how completion percentages are calculated and where progress tracking belongs.

#### 4. Time tracking and efficiency reporting

- A timer for recording time spent on tasks.
- Time records linked to a project, task, and user.
- Start/end times, duration, and notes for time entries.
- Track estimated/bid hours, assigned hours, and actual logged hours.
- Charts and graphs showing project statistics and efficiency.
- Managers can review individual and team performance.
- Employees/associates can review their own performance.
- Managers can review each person’s logged hours by project.

#### 5. Budgets, costs, and expenses

- Track project bid amounts, budgets, and current costs.
- Track costs by project stage for bidding and ongoing monitoring.
- Include hourly-rate information in authorized management views.
- Display project costs in a table with filtering, sorting, and search.
- Record project expenses, including category, description, amount, and spending date.
- Restrict sensitive financial information according to permissions.

Expense records are an addition visible in Shwat’s diagram.

#### 6. Calendar and scheduling

- An in-app calendar with day, week, and month views.
- Show tasks/to-dos and project deadlines.
- Project events with titles, descriptions, start/end times, and an all-day option.
- Work with external calendars: Apple/iCal, Google, and Outlook.

The extent of external integration—import, export, or synchronization—still needs to be defined.

#### 7. People, teams, and permissions

- Project membership and roles.
- Different views and permissions for managers and employees/associates.
	- Different features and views for when it's a school/personal project as well
- See which employees are assigned to which projects.
- A people directory containing project-related contacts, potentially including clients and firm personnel.
- A visual team hierarchy.
- Person detail pages showing name, title, email, projects, assigned hours, logged hours, tasks, and to-dos.
- Decide which people information employees can access.

#### 8. Accounts and profiles

- Login/account access.
- User profiles with username, display name, and avatar.
- Profile access from the sidebar.

Shwat’s diagram suggests these account features; the authentication behavior still needs to be specified.

#### 9. Personalized dashboard and navigation

- A homepage with a personalized greeting.
- Configurable dashboard widgets.
- Drag-and-drop widget arrangement.
- Quick access to selected projects, to-dos, costs, or other relevant information.
- Sidebar navigation for projects, tasks, charts, costs, people, calendar, and profile.
- Task navigation options for priorities, assignments, and lists, as suggested by Shwat’s sidebar sketch.

#### 10. Communication and integrations

- Connect email for task follow-up messages.
- Schedule follow-up emails.
- Export information to Excel or Google Sheets.
- Possible AI features; no specific AI behavior has been defined.

Chat and AI were explicitly exploratory ideas.

#### 11. Project content and templates

- Markdown documentation.
- Possible flowchart support, with draw.io mentioned.
- Project-linked content pages with titles and content.
- Reusable templates with names, descriptions, and content.
- A public/private template setting suggested by Shwat’s diagram.

The pages/templates concept comes from Shwat’s diagram. Whether Markdown documentation and flowcharts are application features or tools for preparing the team’s own documentation needs clarification.

#### 12. Accessibility

- Color-blindness settings.
- Coordinate customizable color coding with accessibility needs.
- Light/dark mode

**Technical decisions still open**
- Hosting approach.
- External-service APIs and registration requirements.
- Supported project management methods.
- Definitions of progress, efficiency, and completion.
- Which ideas belong in the first release versus later versions.
