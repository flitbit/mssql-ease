
CREATE TABLE Laureates
(
  id INT NOT NULL
    CONSTRAINT PK_Laureate_id PRIMARY KEY,
  firstName NVARCHAR(200) NOT NULL,
  surname NVARCHAR(60),
  born DATE,
  died DATE,
  bornCountry NVARCHAR(60),
  bornCity NVARCHAR(60),
  diedCountry NVARCHAR(60),
  diedCountryCode CHAR(2),
  diedCity NVARCHAR(60),
  gender NVARCHAR(7) NOT NULL
    CONSTRAINT CK_Laureate_gender CHECK (gender = 'male' OR gender = 'female' OR gender = 'org')
)
