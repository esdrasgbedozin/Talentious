"""migrate_skills_structure_to_hard_soft

Revision ID: 0a59b3039eea
Revises: 5d94399568e5
Create Date: 2025-11-10 16:31:06.430744

Migration to transform skills structure in profile_data JSONB:
- FROM: "skills": [{"name": "Python", "level": "expert"}, ...]  (old structure)
- TO:   "skills": {"hard": ["Python", ...], "soft": [...]}     (new structure)

Also ensures all required fields exist with proper defaults.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0a59b3039eea'
down_revision: Union[str, None] = '5d94399568e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Migrate existing profile_data to new schema:
    1. Transform skills from List[{name, level}] to {hard: [], soft: []}
    2. Add missing required fields (city, postal_code, country, etc.)
    3. Ensure all fields have proper types (empty string vs null)
    """
    # PostgreSQL function to migrate skills structure
    op.execute("""
        UPDATE user_profiles
        SET profile_data = jsonb_set(
            profile_data,
            '{skills}',
            CASE 
                -- If skills is an array (old structure), convert to new structure
                WHEN jsonb_typeof(profile_data->'skills') = 'array' THEN
                    jsonb_build_object(
                        'hard', (
                            SELECT jsonb_agg(skill->>'name')
                            FROM jsonb_array_elements(profile_data->'skills') AS skill
                            WHERE skill->>'name' IS NOT NULL
                        ),
                        'soft', '[]'::jsonb
                    )
                -- If skills is already an object, keep it
                WHEN jsonb_typeof(profile_data->'skills') = 'object' THEN
                    profile_data->'skills'
                -- If skills doesn't exist or is null, create empty structure
                ELSE
                    '{"hard": [], "soft": []}'::jsonb
            END
        )
        WHERE jsonb_typeof(profile_data->'skills') != 'object' 
           OR profile_data->'skills' IS NULL;
    """)
    
    # Add missing fields to personal_info if they don't exist
    op.execute("""
        UPDATE user_profiles
        SET profile_data = jsonb_set(
            jsonb_set(
                jsonb_set(
                    profile_data,
                    '{personal_info,city}',
                    COALESCE(profile_data->'personal_info'->'city', 'null'::jsonb)
                ),
                '{personal_info,postal_code}',
                COALESCE(profile_data->'personal_info'->'postal_code', 'null'::jsonb)
            ),
            '{personal_info,country}',
            COALESCE(profile_data->'personal_info'->'country', '"France"'::jsonb)
        )
        WHERE profile_data->'personal_info' IS NOT NULL;
    """)
    
    # Ensure summary is a string, not null
    op.execute("""
        UPDATE user_profiles
        SET profile_data = jsonb_set(
            profile_data,
            '{summary}',
            CASE 
                WHEN profile_data->'summary' IS NULL THEN '""'::jsonb
                ELSE profile_data->'summary'
            END
        )
        WHERE profile_data->'summary' IS NULL;
    """)
    
    # Ensure first_name and last_name are strings, not null
    op.execute("""
        UPDATE user_profiles
        SET profile_data = jsonb_set(
            jsonb_set(
                profile_data,
                '{personal_info,first_name}',
                CASE 
                    WHEN profile_data->'personal_info'->'first_name' IS NULL THEN '""'::jsonb
                    ELSE profile_data->'personal_info'->'first_name'
                END
            ),
            '{personal_info,last_name}',
            CASE 
                WHEN profile_data->'personal_info'->'last_name' IS NULL THEN '""'::jsonb
                ELSE profile_data->'personal_info'->'last_name'
            END
        )
        WHERE profile_data->'personal_info' IS NOT NULL;
    """)


def downgrade() -> None:
    """
    Rollback migration: Convert skills back from {hard, soft} to List[{name, level}]
    Note: This is a lossy operation as we lose the hard/soft distinction
    """
    op.execute("""
        UPDATE user_profiles
        SET profile_data = jsonb_set(
            profile_data,
            '{skills}',
            CASE 
                -- If skills is an object (new structure), convert back to array
                WHEN jsonb_typeof(profile_data->'skills') = 'object' THEN
                    (
                        SELECT jsonb_agg(jsonb_build_object('name', skill, 'level', null))
                        FROM (
                            SELECT jsonb_array_elements_text(profile_data->'skills'->'hard') AS skill
                            UNION ALL
                            SELECT jsonb_array_elements_text(profile_data->'skills'->'soft') AS skill
                        ) AS all_skills
                    )
                -- If skills is already an array, keep it
                ELSE profile_data->'skills'
            END
        )
        WHERE jsonb_typeof(profile_data->'skills') = 'object';
    """)
