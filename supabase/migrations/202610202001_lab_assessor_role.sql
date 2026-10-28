-- Lab assessor staff role (20 October 2026). Kept in its own migration because a new enum value
-- must be committed before later statements can use it. Mentors with this role review lab checkpoint
-- submissions and record written-test and practical results; it grants no other staff permissions
-- (see private.is_staff in 202610202002_course_lab_submissions.sql).
alter type public.staff_role add value if not exists 'lab_assessor';
